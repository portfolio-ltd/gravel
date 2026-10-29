"""Graph engineering: workflow edges + stop rule, task dependencies, code graph, in-run subagents."""
import asyncio
import io
import json
import tarfile

from httpx import AsyncClient

from services import code_graph, orchestrator, subagents, task_graph
from tests.test_runtime_protocol import _launch_engineer


async def _workflow(client: AsyncClient, headers: dict, names: list[str]) -> tuple[str, dict[str, str]]:
    resp = await client.post("/api/workflows", json={
        "name": f"WF {'-'.join(names)}", "stages": [{"name": n} for n in names],
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    wf = resp.json()
    return wf["id"], {s["name"]: s["id"] for s in wf["stages"]}


async def _project(client: AsyncClient, headers: dict, workflow_id: str | None = None, **extra) -> str:
    body = {"name": f"Graph {workflow_id or 'phases'}", **extra}
    if workflow_id:
        body["workflow_id"] = workflow_id
    resp = await client.post("/api/projects", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _task(client: AsyncClient, headers: dict, pid: str, title: str, **extra) -> dict:
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": title, **extra}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _wait(predicate, timeout: float = 15.0):
    for _ in range(int(timeout / 0.25)):
        value = await predicate()
        if value:
            return value
        await asyncio.sleep(0.25)
    raise AssertionError("condition not reached")


async def _runs(client: AsyncClient, headers: dict, task_id: str) -> list[dict]:
    return (await client.get(f"/api/tasks/{task_id}/runs", headers=headers)).json()


async def _tasks(client: AsyncClient, headers: dict, pid: str) -> dict[str, dict]:
    return {t["id"]: t for t in (await client.get(f"/api/projects/{pid}", headers=headers)).json()["tasks"]}


# ── Workflow graph ────────────────────────────────────────────────────────────

async def test_success_edge_skips_stages(client: AsyncClient, auth_headers: dict):
    wf_id, ids = await _workflow(client, auth_headers, ["Analyze", "Detour", "Finish"])
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/{ids['Analyze']}",
                              json={"next_stage_id": ids["Finish"]}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["next_stage_id"] == ids["Finish"]
    pid = await _project(client, auth_headers, wf_id)
    task = await _task(client, auth_headers, pid, "Edge task")

    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    async def done():
        return (await _tasks(client, auth_headers, pid))[task["id"]]["status"] == "done"
    await _wait(done)
    visited = {r["workflow_stage_id"] for r in await _runs(client, auth_headers, task["id"])}
    assert visited == {ids["Analyze"], ids["Finish"]}


async def test_edge_validation_and_cleanup(client: AsyncClient, auth_headers: dict):
    wf_id, ids = await _workflow(client, auth_headers, ["A", "B"])
    other_id, other = await _workflow(client, auth_headers, ["X"])
    url = f"/api/workflows/{wf_id}/stages/{ids['A']}"
    assert (await client.patch(url, json={"next_stage_id": ids["A"]}, headers=auth_headers)).status_code == 400
    assert (await client.patch(url, json={"next_stage_id": other["X"]}, headers=auth_headers)).status_code == 400
    assert (await client.patch(url, json={"next_stage_id": ids["B"]}, headers=auth_headers)).status_code == 200

    # Deleting the target clears the edge; clearing it explicitly also works
    assert (await client.delete(f"/api/workflows/{wf_id}/stages/{ids['B']}", headers=auth_headers)).status_code == 204
    stage = (await client.get(f"/api/workflows/{wf_id}", headers=auth_headers)).json()["stages"][0]
    assert stage["next_stage_id"] is None
    assert (await client.patch(url, json={"next_stage_id": None}, headers=auth_headers)).status_code == 200


async def test_stop_rule_parks_a_looping_task(client: AsyncClient, auth_headers: dict, monkeypatch):
    monkeypatch.setattr(orchestrator, "MAX_STAGE_VISITS", 2)
    wf_id, ids = await _workflow(client, auth_headers, ["Ping", "Pong"])
    await client.patch(f"/api/workflows/{wf_id}/stages/{ids['Pong']}",
                       json={"next_stage_id": ids["Ping"]}, headers=auth_headers)
    pid = await _project(client, auth_headers, wf_id)
    task = await _task(client, auth_headers, pid, "Loop task")

    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    async def parked():
        runs = await _runs(client, auth_headers, task["id"])
        return next((r for r in runs if r["approval_required"] and not r["approved_at"]), None)
    run = await _wait(parked)
    assert run["blocking_reason"].startswith("Stop rule: 'Ping'")
    assert len(await _runs(client, auth_headers, task["id"])) == 5  # Ping, Pong, Ping, Pong, parked Ping

    # Approving resets the budget: the loop runs again until the rule trips once more
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    await _wait(parked)
    assert len(await _runs(client, auth_headers, task["id"])) == 10


# ── Task graph ────────────────────────────────────────────────────────────────

async def test_dependencies_validate_and_clean_up(client: AsyncClient, auth_headers: dict):
    pid = await _project(client, auth_headers)
    a = await _task(client, auth_headers, pid, "A")
    b = await _task(client, auth_headers, pid, "B", depends_on=[a["id"]])
    assert b["depends_on"] == [a["id"]]
    other = await _task(client, auth_headers, await _project(client, auth_headers, name="Other"), "Elsewhere")

    url = f"/api/projects/{pid}/tasks/{a['id']}"
    for deps, reason in (([a["id"]], "itself"), ([b["id"]], "cycle"), ([other["id"]], "same project")):
        resp = await client.patch(url, json={"depends_on": deps}, headers=auth_headers)
        assert resp.status_code == 400 and reason in resp.json()["detail"]

    assert (await client.delete(url, headers=auth_headers)).status_code == 204
    assert (await _tasks(client, auth_headers, pid))[b["id"]]["depends_on"] == []


async def test_dependents_wait_then_run(client: AsyncClient, auth_headers: dict):
    wf_id, _ = await _workflow(client, auth_headers, ["Build"])
    pid = await _project(client, auth_headers, wf_id)
    first = await _task(client, auth_headers, pid, "Schema")
    second = await _task(client, auth_headers, pid, "API", depends_on=[first["id"]])

    # Runtime online, so nothing executes in-process: only the ready task is queued
    _, launch = await _launch_engineer(client, auth_headers)
    rt = {"Authorization": f"Bearer {launch['runtime_token']}"}
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert await _runs(client, auth_headers, second["id"]) == []

    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["task"]["id"] == first["id"]
    resp = await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                             json={"outcome": "build_complete", "summary": "done"}, headers=rt)
    assert resp.status_code == 200, resp.text

    # Finishing the dependency queued the dependent
    tasks = await _tasks(client, auth_headers, pid)
    assert tasks[first["id"]]["status"] == "done"
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["task"]["id"] == second["id"]


def test_link_by_index_drops_bad_edges():
    class T:
        def __init__(self, id):
            self.id, self.depends_on = id, None
    tasks = [T("a"), T("b"), T("c")]
    task_graph.link_by_index(tasks, [{"depends_on": [3]}, {"depends_on": [1, 9, "x"]}, {"depends_on": [2, 3]}])
    # a→c and b→a are kept; c→b would close a→c→b→a; self-edges, out-of-range and junk are dropped
    assert [t.depends_on for t in tasks] == [["c"], ["a"], None]
    edges = {t.id: t.depends_on or [] for t in tasks}
    assert not any(task_graph._has_path(edges, dep, t) for t, deps in edges.items() for dep in deps)


# ── Code graph ────────────────────────────────────────────────────────────────

REPO = {
    "README.md": "# Shop\nA tiny shop.",
    "Makefile": "test:\n\tpytest\nlint:\n\truff check .\n",
    "api/pyproject.toml": '[project]\ndependencies = ["fastapi", "sqlalchemy"]\n[tool.pytest.ini_options]\n',
    "api/main.py": "from routers import orders\nimport os\n",
    "api/routers/__init__.py": "",
    "api/routers/orders.py": "from services.billing import charge\nfrom ..models import order\nimport httpx\n",
    "api/services/__init__.py": "",
    "api/services/billing.py": "from models.order import Order\nimport stripe\n",
    "api/models/__init__.py": "",
    "api/models/order.py": "class Order: ...\n",
    "web/package.json": json.dumps({"name": "web", "scripts": {"test": "vitest", "build": "next build"},
                                    "dependencies": {"next": "15", "react": "19"}}),
    "web/tsconfig.json": '{\n  // aliases\n  "compilerOptions": {"paths": {"@/*": ["./*"]},},\n}',
    "web/app/page.tsx": "import { Cart } from '@/components/Cart'\nimport x from 'react'\n",
    "web/components/Cart.tsx": "import { api } from '../lib/api'\nexport function Cart() {}\n",
    "web/lib/api.ts": "export const api = 1\n",
    "svc/go.mod": "module example.com/svc\n",
    "svc/main.go": 'package main\nimport (\n  "fmt"\n  "example.com/svc/store"\n  "github.com/lib/pq"\n)\n',
    "svc/store/db.go": "package store\n",
}


def test_resolver_follows_imports_across_languages():
    resolver = code_graph._Resolver(REPO, code_graph._code_files(REPO))
    for src, targets, externals in (
        ("api/main.py", {"api/routers/orders.py"}, set()),
        ("api/routers/orders.py", {"api/services/billing.py", "api/models/__init__.py", "api/models/order.py"},
         {"httpx"}),
        ("api/services/billing.py", {"api/models/order.py"}, {"stripe"}),
        ("web/app/page.tsx", {"web/components/Cart.tsx"}, {"react"}),   # tsconfig alias @/*
        ("web/components/Cart.tsx", {"web/lib/api.ts"}, set()),
        ("svc/main.go", {"svc/store/db.go"}, {"github.com/lib/pq"}),    # go.mod module path; fmt is stdlib
    ):
        internal, external = resolver.resolve(src)
        assert set(internal) == targets, src
        assert set(external) == externals, src


def test_analyze_builds_modules_edges_and_commands():
    big = dict(REPO)  # enough files that api/ splits into submodules
    big.update({f"api/services/s{i}.py": "from models.order import Order\n" for i in range(40)})
    graph = code_graph.analyze(big, list(big) + ["web/yarn.lock", ".github/workflows/ci.yml"])
    modules = {m["id"]: m for m in graph["modules"]}
    assert {"api/services", "api/models", "api/routers", "web", "svc"} <= set(modules)
    edges = {(e["source"], e["target"]): e["weight"] for e in graph["edges"]}
    assert edges[("api/services", "api/models")] == 41
    assert ("api/routers", "api/services") in edges and ("api", "api/routers") in edges
    assert modules["api/services"]["key_files"][0] == "api/services/billing.py"  # most imported first
    assert "stripe" in modules["api/services"]["externals"]
    assert {"FastAPI", "SQLAlchemy", "Next.js", "React", "Go", "GitHub Actions"} <= set(graph["stack"])
    runs = {(c["cwd"], c["run"]) for c in graph["commands"]}
    assert {(".", "make test"), ("api", "pytest -q"), ("web", "yarn test"), ("svc", "go test ./...")} <= runs
    assert "api/main.py" in graph["entry_points"]


def test_read_tarball_strips_prefix_and_skips_noise():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path, data in (("acme-shop-abc123/app.py", b"print(1)\n"), ("acme-shop-abc123/logo.png", b"\x89PNG"),
                           ("acme-shop-abc123/node_modules/x/index.js", b"x"), ("acme-shop-abc123/bin.py", b"\x00\x01")):
            info = tarfile.TarInfo(path)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    paths, files = code_graph.read_tarball(buf.getvalue())
    assert paths == ["app.py", "logo.png", "bin.py"]
    assert files == {"app.py": "print(1)\n"}


def test_task_relevance_and_render():
    graph = code_graph.analyze(REPO, list(REPO))
    assert code_graph.relevant_modules(graph, "Charge the card when billing an order")[0] == "api"
    assert code_graph.relevant_modules(graph, "Show the cart total")[0] == "web"

    class Row:
        repo_url, commit_sha, summary_markdown, built_at = "https://github.com/acme/shop", "abc1234def", "A shop.", None

    class Entry:
        kind, number = type("K", (), {"value": "decision"})(), 1
        title, body_markdown = "Billing goes through Stripe", "All charges in api/services use Stripe."
    Row.graph = graph
    text = code_graph.render_for_task(Row, "Charge the card when billing an order", [Entry])
    assert "## Modules this task likely touches" in text and "`pytest -q` in `api`" in text
    assert "Billing goes through Stripe" in text


async def test_build_endpoint_maps_repo_and_feeds_runs(client: AsyncClient, auth_headers: dict, monkeypatch):
    async def fake_snapshot(repo_url, token, ref):
        return code_graph.Snapshot(commit_sha="abc1234", files=dict(REPO), paths=list(REPO))
    monkeypatch.setattr(code_graph, "fetch_snapshot", fake_snapshot)

    pid = await _project(client, auth_headers)
    assert (await client.get(f"/api/projects/{pid}/code-graph", headers=auth_headers)).json() is None
    assert (await client.post(f"/api/projects/{pid}/code-graph/build", headers=auth_headers)).status_code == 400

    await client.patch(f"/api/projects/{pid}", json={"repo_url": "https://github.com/acme/shop"}, headers=auth_headers)
    resp = await client.post(f"/api/projects/{pid}/code-graph/build", headers=auth_headers)
    assert resp.status_code == 202, resp.text

    async def ready():
        body = (await client.get(f"/api/projects/{pid}/code-graph", headers=auth_headers)).json()
        return body if body and body["status"] == "ready" else None
    graph = await _wait(ready)
    assert graph["commit_sha"] == "abc1234" and graph["graph"]["modules"]
    assert "Structure only" in graph["summary_markdown"]  # no API key → deterministic overview

    # A runtime's bundle carries the code map, subagents and the test gate
    task = await _task(client, auth_headers, pid, "Charge orders through billing")
    _, launch = await _launch_engineer(client, auth_headers)
    rt = {"Authorization": f"Bearer {launch['runtime_token']}"}
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    bundle = (await client.post("/api/agent/poll-next-task", headers=rt)).json()["bundle"]
    assert "Modules this task likely touches" in bundle["CODE_MAP.md"]
    assert set(json.loads(bundle["claude/agents.json"])) == {"explorer"}  # grooming → analyze role
    assert "claude/settings.json" not in bundle  # the test gate only guards code-writing runs
    assert task["id"]


# ── In-run subagents ──────────────────────────────────────────────────────────

def test_subagent_bundle_per_role():
    graph = code_graph.analyze(REPO, list(REPO))
    build = subagents.bundle_files(subagents.role_for("build", None), graph)
    assert set(json.loads(build["claude/agents.json"])) == {"explorer", "implementer", "test-runner", "reviewer"}
    hook = json.loads(build["claude/settings.json"])["hooks"]["Stop"][0]["hooks"][0]
    assert hook["command"].endswith('.gravel/claude/test_gate.py"')
    assert {"cwd": "api", "run": "pytest -q"} in json.loads(build["claude/test_gate.json"])
    compile(build["claude/test_gate.py"], "test_gate.py", "exec")

    assert "claude/settings.json" not in subagents.bundle_files("build", None)  # no commands known
    assert subagents.bundle_files("deploy", graph) == {}
    assert subagents.role_for(None, "testing") == "verify" and subagents.role_for("mystery", None) == "custom"


def test_test_gate_script_blocks_once_on_failures(tmp_path):
    import subprocess
    import sys

    gate = tmp_path / ".gravel" / "claude"
    gate.mkdir(parents=True)
    (gate / "test_gate.py").write_text(subagents.GATE_SCRIPT)

    def run(commands: list[dict], event: dict) -> subprocess.CompletedProcess:
        (gate / "test_gate.json").write_text(json.dumps(commands))
        return subprocess.run([sys.executable, str(gate / "test_gate.py")], input=json.dumps(event), text=True,
                              capture_output=True, cwd=tmp_path, env={"CLAUDE_PROJECT_DIR": str(tmp_path), "PATH": "/usr/bin:/bin"})

    failing = [{"cwd": ".", "run": "echo 'AssertionError: 1 != 2' && exit 1"}]
    blocked = run(failing, {"stop_hook_active": False})
    assert blocked.returncode == 2 and "AssertionError: 1 != 2" in blocked.stderr
    assert run(failing, {"stop_hook_active": True}).returncode == 0  # never loops
    assert run([{"cwd": ".", "run": "true"}], {}).returncode == 0
    assert run([{"cwd": ".", "run": "no-such-tool-xyz"}], {}).returncode == 0  # not installed → no gate
    assert run([{"cwd": "missing", "run": "false"}], {}).returncode == 0
