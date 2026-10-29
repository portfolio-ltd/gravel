"""Agent harnesses, the knowledge map (wikilinks, backlinks, slugs, export/import) and external links."""
import io
import json
import zipfile

from httpx import AsyncClient

from services import harness as harness_svc
from services import knowledge_graph as kg
from services import subagents
from tests.test_runtime_protocol import _launch_engineer


async def _knowledge(client: AsyncClient, headers: dict, **body) -> dict:
    resp = await client.post("/api/knowledge", json={"kind": "wiki", "body_markdown": "", **body}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _task(client: AsyncClient, headers: dict, pid: str, title: str, **extra) -> dict:
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": title, **extra}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Harnesses ─────────────────────────────────────────────────────────────────

async def test_harness_templates_and_crud(client: AsyncClient, auth_headers: dict):
    templates = (await client.get("/api/harnesses/templates", headers=auth_headers)).json()
    assert {t["key"] for t in templates} >= {"spec-driven", "solo", "parallel-build", "review-heavy", "read-only"}

    resp = await client.post("/api/harnesses/from-template",
                             json={"template_key": "review-heavy", "make_default": True}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    heavy = resp.json()
    assert heavy["is_default"] and "security-reviewer" in heavy["agents"] and heavy["max_review_rounds"] == 3

    resp = await client.post("/api/harnesses", json={
        "name": "Docs only", "executor": "claude-code", "roles": ["analyze"], "max_turns": 30,
        "disallowed_tools": ["Edit", "Write"], "test_gate": False,
        "agents": {"scout": {"description": "finds things", "prompt": "Find the files.", "tools": ["Read"]}},
        "routing": {"*": "Use scout, then write."}, "instructions_markdown": "Never touch migrations.",
        "is_default": True,
    }, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    docs = resp.json()
    listed = (await client.get("/api/harnesses", headers=auth_headers)).json()
    assert [h["is_default"] for h in listed if h["id"] == heavy["id"]] == [False]  # only one default
    assert [h["is_default"] for h in listed if h["id"] == docs["id"]] == [True]

    assert (await client.post("/api/harnesses", json={"name": "x", "executor": "bash"}, headers=auth_headers)).status_code == 400
    assert (await client.post("/api/harnesses", json={"name": "x", "roles": ["cook"]}, headers=auth_headers)).status_code == 400
    assert (await client.post("/api/harnesses", json={
        "name": "x", "agents": {"bad name!": {"prompt": "p"}}}, headers=auth_headers)).status_code == 400

    preview = (await client.get(f"/api/harnesses/{docs['id']}/preview?role=analyze", headers=auth_headers)).json()
    assert set(json.loads(preview["files"]["claude/agents.json"])) == {"scout"}
    assert json.loads(preview["files"]["harness.json"])["disallowed_tools"] == ["Edit", "Write"]
    assert "Never touch migrations." in preview["files"]["HARNESS.md"]
    assert "claude/settings.json" not in preview["files"]

    resp = await client.patch(f"/api/harnesses/{docs['id']}", json={"max_turns": 10, "name": None}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["max_turns"] == 10 and resp.json()["name"] == "Docs only"
    assert (await client.delete(f"/api/harnesses/{docs['id']}", headers=auth_headers)).status_code == 204
    assert (await client.get(f"/api/harnesses/{docs['id']}", headers=auth_headers)).status_code == 404


def test_harness_config_filters_agents_by_role():
    from models.harness import AgentHarness
    h = AgentHarness(id="h1", organization_id="o", name="H", executor="any", test_gate=True, max_review_rounds=1,
                     max_turns=0, agents={
                         "everywhere": {"description": "d", "prompt": "p"},
                         "build-only": {"description": "d", "prompt": "p", "roles": ["build"]},
                         "reviewer": {"description": "d", "prompt": "p", "roles": ["build"]},
                         "broken": {"description": "no prompt"},
                     }, routing={"build": "Build routing.", "*": "Default routing."})
    build = harness_svc.config_for(h, "build")
    assert set(build.agents) == {"everywhere", "build-only", "reviewer"} and build.routing == "Build routing."
    plan = harness_svc.config_for(h, "plan")
    assert set(plan.agents) == {"everywhere"} and plan.routing == "Default routing."
    files = subagents.bundle_files("build", None, h)
    assert "Stop rule: at most 1 review round" in files["SUBAGENTS.md"]
    assert "Stop rule" not in subagents.bundle_files("plan", None, h)["SUBAGENTS.md"]  # no reviewer for plan
    assert harness_svc.config_for(None, "verify").agents.keys() == {"test-runner", "criterion-checker"}


async def test_stage_pins_a_harness_and_runs_record_it(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/harnesses/from-template", json={"template_key": "read-only"}, headers=auth_headers)
    harness_id = resp.json()["id"]
    await client.patch(f"/api/harnesses/{harness_id}", json={"instructions_markdown": "Cite file paths."}, headers=auth_headers)

    resp = await client.post("/api/workflows", json={"name": "Pinned", "stages": [
        {"name": "Analyze", "role": "analyze"}, {"name": "Build", "role": "build"}]}, headers=auth_headers)
    wf = resp.json()
    analyze = wf["stages"][0]
    assert (await client.patch(f"/api/workflows/{wf['id']}/stages/{analyze['id']}",
                               json={"harness_id": "nope"}, headers=auth_headers)).status_code == 400
    resp = await client.patch(f"/api/workflows/{wf['id']}/stages/{analyze['id']}",
                              json={"harness_id": harness_id}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["harness_id"] == harness_id

    pid = (await client.post("/api/projects", json={"name": "Pinned", "workflow_id": wf["id"]}, headers=auth_headers)).json()["id"]
    task = await _task(client, auth_headers, pid, "Pinned task")
    _, launch = await _launch_engineer(client, auth_headers)
    rt = {"Authorization": f"Bearer {launch['runtime_token']}"}
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    poll = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    bundle = poll["bundle"]
    assert json.loads(bundle["harness.json"])["max_turns"] == 60
    assert "Harness: Read-only analysis" in bundle["HARNESS.md"]
    assert "## Harness instructions\n\nCite file paths." in bundle["STAGE_INSTRUCTIONS.md"]
    assert set(json.loads(bundle["claude/agents.json"])) == {"explorer"}
    runs = (await client.get(f"/api/tasks/{task['id']}/runs", headers=auth_headers)).json()
    assert runs[0]["harness_id"] == harness_id


# ── Knowledge map ─────────────────────────────────────────────────────────────

def test_wikilink_parsing_and_flattening():
    assert kg.parse_wikilinks("See [[Invoice]], [[invoice|an invoice]] and [[Exports#Why]] and [[Invoice]]") == \
        ["Invoice", "invoice", "Exports"]
    assert kg.slugify("Stream large exports!") == "stream-large-exports"
    from models.sdlc import KnowledgeEntry, KnowledgeKind
    invoice = KnowledgeEntry(id="a", organization_id="o", kind=KnowledgeKind.glossary, title="Invoice", slug="invoice")
    resolver = kg.Resolver([invoice])
    assert resolver.resolve("INVOICE") is invoice and resolver.resolve("invoice") is invoice and resolver.resolve("x") is None
    assert kg.flatten_wikilinks("An [[invoice|bill]] per [[Invoice]]; see [[Invoice#Due]] and [[Ghost]]", resolver) == \
        "An bill per Invoice; see Invoice (see “Due” under Invoice) and Ghost"


async def test_slugs_links_backlinks_and_parents(client: AsyncClient, auth_headers: dict):
    invoice = await _knowledge(client, auth_headers, kind="glossary", title="Invoice", body_markdown="A bill.")
    assert invoice["slug"] == "invoice"
    twin = await _knowledge(client, auth_headers, kind="glossary", title="Invoice", body_markdown="Another.")
    assert twin["slug"] == "invoice-2"
    overview = await _knowledge(client, auth_headers, title="Billing overview", parent_id=None,
                                body_markdown="Every [[Invoice]] is billed; see [[Dunning]] and [[invoice-2|the twin]].")
    stream = await _knowledge(client, auth_headers, kind="pattern", title="Stream exports",
                              body_markdown="Used by [[Billing overview#Exports]].", parent_id=overview["id"])

    links = (await client.get(f"/api/knowledge/{overview['id']}/links", headers=auth_headers)).json()
    assert [x["id"] for x in links["outgoing"]] == [invoice["id"], twin["id"]]
    assert [x["id"] for x in links["backlinks"]] == [stream["id"]]
    assert [x["id"] for x in links["children"]] == [stream["id"]]
    assert links["unresolved"] == ["Dunning"]

    assert (await client.get("/api/knowledge/by-slug/invoice", headers=auth_headers)).json()["id"] == invoice["id"]
    assert (await client.get("/api/knowledge/by-slug/Stream%20Exports", headers=auth_headers)).json()["id"] == stream["id"]
    assert (await client.get("/api/knowledge/by-slug/nothing", headers=auth_headers)).status_code == 404
    assert (await client.get(f"/api/knowledge/{stream['id']}", headers=auth_headers)).json()["parent_id"] == overview["id"]

    # Parent cycles and self-parenting are rejected; a renamed title keeps its slug unless asked
    assert (await client.patch(f"/api/knowledge/{overview['id']}", json={"parent_id": stream["id"]}, headers=auth_headers)).status_code == 400
    assert (await client.patch(f"/api/knowledge/{overview['id']}", json={"parent_id": overview["id"]}, headers=auth_headers)).status_code == 400
    renamed = (await client.patch(f"/api/knowledge/{invoice['id']}", json={"title": "Customer invoice"}, headers=auth_headers)).json()
    assert renamed["slug"] == "invoice"
    reslugged = (await client.patch(f"/api/knowledge/{invoice['id']}", json={"slug": "Customer Invoice"}, headers=auth_headers)).json()
    assert reslugged["slug"] == "customer-invoice"

    # KNOWLEDGE.md for engineers flattens links and includes wiki pages
    text = (await client.get("/api/knowledge/export", headers=auth_headers)).text
    # [[Invoice]] now resolves by title to the twin (the original was renamed and re-slugged)
    assert "## Wiki" in text and "[[" not in text and "Every Invoice is billed; see Dunning and the twin." in text


async def test_map_joins_knowledge_tasks_links_and_prds(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    invoice = await _knowledge(client, auth_headers, kind="glossary", title="Invoice", body_markdown="A bill.")
    overview = await _knowledge(client, auth_headers, title="Billing overview", project_id=pid,
                                body_markdown="Every [[Invoice]]. Missing: [[Dunning]].")
    first = await _task(client, auth_headers, pid, "Model the [[Invoice]]")
    second = await _task(client, auth_headers, pid, "Export invoices", depends_on=[first["id"]])
    resp = await client.post("/api/links", json={"entity_type": "task", "entity_id": second["id"],
                                                  "url": "https://www.figma.com/file/x", "kind": "design"}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    link = resp.json()
    assert link["title"] == "www.figma.com"  # title defaults to the host
    resp = await client.post("/api/prds", json={"title": "Billing PRD", "body_markdown": "Covers [[Invoice]] exports."}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    prd = resp.json()

    data = (await client.get("/api/map", headers=auth_headers)).json()
    ids = {n["id"] for n in data["nodes"]}
    assert {f"knowledge:{invoice['id']}", f"knowledge:{overview['id']}", f"task:{first['id']}", f"task:{second['id']}",
            f"project:{pid}", f"link:{link['id']}", f"prd:{prd['id']}"} <= ids
    edges = {(e["source"], e["target"], e["type"]) for e in data["edges"]}
    assert (f"knowledge:{overview['id']}", f"knowledge:{invoice['id']}", "wikilink") in edges
    assert (f"project:{pid}", f"knowledge:{overview['id']}", "scope") in edges
    assert (f"task:{first['id']}", f"task:{second['id']}", "depends") in edges
    assert (f"task:{first['id']}", f"knowledge:{invoice['id']}", "mentions") in edges
    assert (f"task:{second['id']}", f"link:{link['id']}", "link") in edges
    assert (f"prd:{prd['id']}", f"knowledge:{invoice['id']}", "mentions") in edges
    assert data["unresolved"] == [{"source": f"knowledge:{overview['id']}", "targets": ["Dunning"]}]
    assert next(n for n in data["nodes"] if n["id"] == f"knowledge:{invoice['id']}")["degree"] == 3  # wikilink + task mention + PRD mention
    assert data["counts"]["knowledge"] == 2 and data["counts"]["link"] == 1

    scoped = (await client.get(f"/api/map?project_id={pid}&tasks=false", headers=auth_headers)).json()
    assert not any(n["type"] == "task" for n in scoped["nodes"])
    assert (await client.get("/api/map?project_id=nope", headers=auth_headers)).status_code == 404


async def test_obsidian_export_and_markdown_import(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    decision = await _knowledge(client, auth_headers, kind="decision", title="Use Postgres",
                                body_markdown="## Context\n\nSee [[Invoice: the term]].")
    await _knowledge(client, auth_headers, kind="glossary", title="Invoice: the term", body_markdown="A bill.")
    task = await _task(client, auth_headers, pid, "Ship it")

    resp = await client.get("/api/knowledge/export/obsidian", headers=auth_headers)
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/zip"
    vault = zipfile.ZipFile(io.BytesIO(resp.content))
    names = set(vault.namelist())
    assert "Decisions/Use Postgres.md" in names and "Glossary/Invoice- the term.md" in names
    assert f"Tasks/{project['name']}/Ship it.md" in names and "graph.json" in names and "README.md" in names
    note = vault.read("Decisions/Use Postgres.md").decode()
    assert note.startswith("---\n") and f"gravel_id: {decision['id']}" in note and "kind: decision" in note
    assert "[[Invoice: the term]]" in note  # wikilinks survive the export
    # The glossary file name had to be sanitised, so its title becomes an alias Obsidian resolves
    assert "aliases:\n  - \"Invoice: the term\"" in vault.read("Glossary/Invoice- the term.md").decode()
    assert json.loads(vault.read("graph.json"))["counts"]["task"] == 1
    assert task["id"]

    # Round trip: the exported note updates its entry; a new note creates one, kind from its folder
    files = [
        ("files", ("Decisions/Use Postgres.md", note.replace("See [[Invoice: the term]].", "Changed."), "text/markdown")),
        ("files", ("Runbooks/Restart billing.md", "# Restart billing\n\n1. Do the thing. See [[Use Postgres]].", "text/markdown")),
        ("files", ("notes/Untitled.md", "---\nkind: convention\ntitle: Commit style\n---\nUse imperative subjects.", "text/markdown")),
        ("files", ("photo.png", b"\x89PNG", "image/png")),
    ]
    resp = await client.post("/api/knowledge/import", files=files, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"created": 2, "updated": 1, "skipped": 1,
                           "titles": ["Use Postgres", "Restart billing", "Commit style"]}
    entries = {e["title"]: e for e in (await client.get("/api/knowledge?status=accepted", headers=auth_headers)).json()}
    assert entries["Use Postgres"]["body_markdown"] == "## Context\n\nChanged."
    assert entries["Restart billing"]["kind"] == "runbook" and entries["Commit style"]["kind"] == "convention"
    links = (await client.get(f"/api/knowledge/{entries['Restart billing']['id']}/links", headers=auth_headers)).json()
    assert [x["id"] for x in links["outgoing"]] == [decision["id"]]

    # A note without a kind never changes an existing entry's kind; task / PRD / project
    # / README notes from the vault are not knowledge and are skipped
    again = await client.post("/api/knowledge/import", files=[
        ("files", ("Restart billing.md", "# Restart billing\n\n1. Updated steps.", "text/markdown")),
        ("files", (f"Tasks/{project['name']}/Ship it.md", vault.read(f"Tasks/{project['name']}/Ship it.md"), "text/markdown")),
        ("files", ("README.md", vault.read("README.md"), "text/markdown")),
        ("files", ("Projects/P.md", "---\ntype: project\n---\n# P\n\nx", "text/markdown")),
    ], headers=auth_headers)
    assert again.json() == {"created": 0, "updated": 1, "skipped": 3, "titles": ["Restart billing"]}
    entries = {e["title"]: e for e in (await client.get("/api/knowledge?status=accepted", headers=auth_headers)).json()}
    assert entries["Restart billing"]["kind"] == "runbook" and entries["Restart billing"]["body_markdown"] == "1. Updated steps."
    assert "Ship it" not in entries and "Gravel knowledge vault" not in entries


async def test_external_links_crud_and_bundle(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await _knowledge(client, auth_headers, kind="pattern", title="Stream exports", body_markdown="Stream.")
    task = await _task(client, auth_headers, pid, "Linked task",
                       description="Follow [[stream-exports|the export pattern]], see [[Ghost]]")
    bad = await client.post("/api/links", json={"entity_type": "task", "entity_id": task["id"], "url": "javascript:alert(1)"},
                            headers=auth_headers)
    assert bad.status_code == 422
    missing = await client.post("/api/links", json={"entity_type": "prd", "entity_id": task["id"], "url": "https://x.y"},
                                headers=auth_headers)
    assert missing.status_code == 404
    for entity_type, entity_id, title, kind in (
        ("project", pid, "Grafana", "dashboard"), ("task", task["id"], "Ticket OPS-12", "ticket"),
    ):
        resp = await client.post("/api/links", json={"entity_type": entity_type, "entity_id": entity_id,
                                                      "url": f"https://example.com/{kind}", "title": title, "kind": kind,
                                                      "description": "handy"}, headers=auth_headers)
        assert resp.status_code == 201, resp.text
    listed = (await client.get(f"/api/links?entity_type=task&entity_id={task['id']}", headers=auth_headers)).json()
    assert [x["title"] for x in listed] == ["Ticket OPS-12"]
    patched = (await client.patch(f"/api/links/{listed[0]['id']}", json={"title": "  OPS-12  ", "kind": "other"}, headers=auth_headers)).json()
    assert patched["title"] == "OPS-12" and patched["kind"] == "other"

    _, launch = await _launch_engineer(client, auth_headers)
    rt = {"Authorization": f"Bearer {launch['runtime_token']}"}
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    bundle = (await client.post("/api/agent/poll-next-task", headers=rt)).json()["bundle"]
    assert "## Project\n- [Grafana](https://example.com/dashboard) — dashboard: handy" in bundle["LINKS.md"]
    assert "Follow the export pattern, see Ghost" in bundle["TASK.md"]  # wikilinks flattened for agents
    assert "## Task: Linked task\n- [OPS-12](https://example.com/ticket) — other" in bundle["LINKS.md"]

    assert (await client.delete(f"/api/links/{listed[0]['id']}", headers=auth_headers)).status_code == 204
    assert (await client.get(f"/api/links?entity_id={task['id']}", headers=auth_headers)).json() == []
