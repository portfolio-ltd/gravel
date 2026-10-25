"""Spec-driven delivery end to end: templates, documents, open-question gate,
review rework, request-changes, knowledge base, issue import, evidence files."""
import asyncio
import io

from httpx import AsyncClient

from tests.test_runtime_protocol import _launch_engineer


async def _wait_for_gate(client: AsyncClient, headers: dict, task_id: str, stage_name: str | None = None,
                         timeout: float = 15.0) -> dict:
    runs: list = []
    for _ in range(int(timeout / 0.2)):
        runs = (await client.get(f"/api/tasks/{task_id}/runs", headers=headers)).json()
        for run in runs:
            if run["approval_required"] and not run["approved_at"]:
                if stage_name is None or await _stage_name(client, headers, run["workflow_stage_id"]) == stage_name:
                    return run
        await asyncio.sleep(0.2)
    raise AssertionError(f"No gate at {stage_name or 'any stage'} for {task_id}: {runs}")


_STAGE_NAMES: dict[str, str] = {}


async def _stage_name(client: AsyncClient, headers: dict, stage_id: str | None) -> str:
    if stage_id not in _STAGE_NAMES:
        for wf in (await client.get("/api/workflows", headers=headers)).json():
            for s in wf["stages"]:
                _STAGE_NAMES[s["id"]] = s["name"]
    return _STAGE_NAMES.get(stage_id, "")


async def _wait_done(client: AsyncClient, headers: dict, pid: str, task_id: str, timeout: float = 15.0) -> dict:
    for _ in range(int(timeout / 0.2)):
        task = next(t for t in (await client.get(f"/api/projects/{pid}", headers=headers)).json()["tasks"]
                    if t["id"] == task_id)
        if task["status"] == "done":
            return task
        await asyncio.sleep(0.2)
    raise AssertionError(f"Task never finished: {task}")


async def _spec_project(client: AsyncClient, headers: dict, template: str = "spec-driven") -> tuple[str, str, dict]:
    resp = await client.post("/api/projects", json={"name": "Spec project", "workflow_template": template},
                             headers=headers)
    assert resp.status_code == 201, resp.text
    project = resp.json()
    assert project["workflow_id"]
    resp = await client.post(f"/api/projects/{project['id']}/tasks", json={
        "title": "Export invoices as CSV", "description": "Finance wants a CSV export of invoices.",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return project["id"], resp.json()["id"], project


async def test_meta_and_templates(client: AsyncClient, auth_headers: dict):
    meta = (await client.get("/api/meta", headers=auth_headers)).json()
    assert meta["default_model"]
    assert {r["key"] for r in meta["stage_roles"]} >= {"analyze", "refine", "plan", "build", "review", "verify"}
    assert any(t["key"] == "spec-driven" and t["recommended"] for t in meta["workflow_templates"])

    resp = await client.post("/api/workflows/from-template", json={"template_key": "spec-driven"}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    wf = resp.json()
    assert wf["template_key"] == "spec-driven"
    by_name = {s["name"]: s for s in wf["stages"]}
    assert [s["role"] for s in wf["stages"]] == ["analyze", "refine", "plan", "build", "review", "verify"]
    assert by_name["Plan"]["block_on_open_questions"] is True
    assert by_name["Review"]["rework_target_stage_id"] == by_name["Build"]["id"]

    # A second instantiation gets a unique name; projects reuse the first
    resp = await client.post("/api/workflows/from-template", json={"template_key": "spec-driven"}, headers=auth_headers)
    assert resp.json()["name"].endswith("(2)")
    resp = await client.post("/api/projects", json={"name": "P", "workflow_template": "spec-driven"}, headers=auth_headers)
    assert resp.json()["workflow_id"] == wf["id"]

    resp = await client.post("/api/workflows/from-template", json={"template_key": "nope"}, headers=auth_headers)
    assert resp.status_code == 404
    resp = await client.post(f"/api/workflows/{wf['id']}/stages", json={"name": "X", "role": "wizard"}, headers=auth_headers)
    assert resp.status_code == 400


async def test_spec_driven_flow_end_to_end(client: AsyncClient, auth_headers: dict):
    """Simulated engineer (no API key) drives a task through all six stages."""
    pid, task_id, _ = await _spec_project(client, auth_headers)
    resp = await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert resp.status_code == 202

    # Analyze runs ungated → Refine spec gates for human approval
    run = await _wait_for_gate(client, auth_headers, task_id, "Refine spec")
    assert run["outcome"] == "build_complete"
    docs = {d["kind"]: d for d in (await client.get(f"/api/tasks/{task_id}/documents", headers=auth_headers)).json()}
    assert {"analysis", "spec"} <= set(docs)
    task = (await client.get(f"/api/projects/{pid}/tasks", headers=auth_headers)).json()[0]
    assert len(task["acceptance_criteria"]) == 2
    assert all(c["source"] == "ai" for c in task["acceptance_criteria"])
    questions = (await client.get(f"/api/tasks/{task_id}/questions", headers=auth_headers)).json()
    assert len(questions) == 1 and questions[0]["status"] == "open" and questions[0]["owner"] == "Product owner"

    # Approve the spec → the plan completes but parks on the open question
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    run = await _wait_for_gate(client, auth_headers, task_id, "Plan")
    assert run["outcome"] == "needs_human_input"
    assert "open question" in run["blocking_reason"]
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 409

    # Answer it → approving re-runs the plan, which now gates on approval
    resp = await client.patch(f"/api/questions/{questions[0]['id']}", json={"answer": "Finance analysts"},
                              headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["status"] == "answered"
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    for _ in range(50):
        run = await _wait_for_gate(client, auth_headers, task_id, "Plan")
        if run["outcome"] == "build_complete":
            break
        await asyncio.sleep(0.2)
    assert run["outcome"] == "build_complete"
    docs = {d["kind"]: d for d in (await client.get(f"/api/tasks/{task_id}/documents", headers=auth_headers)).json()}
    assert {"plan", "scenarios"} <= set(docs)
    assert "Feature: Export invoices as CSV" in docs["scenarios"]["body_markdown"]

    # Approve the plan → build → review (pass) → verify gates → approve → done
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    run = await _wait_for_gate(client, auth_headers, task_id, "Verify")
    docs = {d["kind"] for d in (await client.get(f"/api/tasks/{task_id}/documents", headers=auth_headers)).json()}
    assert {"review", "verification"} <= docs
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    task = await _wait_done(client, auth_headers, pid, task_id)
    assert task["rework_count"] == 0


async def test_runtime_bundle_and_review_rework(client: AsyncClient, auth_headers: dict):
    """A runtime gets the SDLC bundle; a review verdict of changes_requested loops back to Build."""
    _, launch = await _launch_engineer(client, auth_headers)
    rt = {"Authorization": f"Bearer {launch['runtime_token']}"}
    pid, task_id, _ = await _spec_project(client, auth_headers, template="plan-build-review")
    await client.post("/api/knowledge", json={"kind": "decision", "title": "Use REST", "body_markdown": "JSON over HTTP."},
                      headers=auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["role"] == "plan"
    assert payload["workflow_stage"]["produces"] == ["plan", "scenarios"]
    bundle = payload["bundle"]
    assert "DR-0001: Use REST" in bundle["KNOWLEDGE.md"]
    assert "OUTPUT_CONTRACT.md" in bundle and "QUESTIONS.md" in bundle
    assert "Role: Technical plan" in bundle["STAGE_INSTRUCTIONS.md"]

    resp = await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome", json={
        "outcome": "build_complete", "summary": "Planned.",
        "documents": [{"kind": "plan", "title": "Plan", "body": "## Summary\nDo it."}],
        "acceptance_criteria": ["CSV downloads with one row per invoice"],
        "knowledge": [{"kind": "pattern", "title": "Streaming CSV responses", "body": "Use a generator."}],
    }, headers=rt)
    assert resp.status_code == 200, resp.text
    run = await _wait_for_gate(client, auth_headers, task_id, "Plan")
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)

    # The plan's proposed pattern awaits human acceptance
    proposed = (await client.get("/api/knowledge?status=proposed", headers=auth_headers)).json()
    assert [k["title"] for k in proposed] == ["Streaming CSV responses"]

    # Build → the bundle now carries the plan
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["role"] == "build"
    assert payload["bundle"]["docs/PLAN.md"].startswith("## Summary")
    assert "CSV downloads with one row per invoice" in payload["bundle"]["TASK.md"]
    await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                      json={"outcome": "build_complete", "summary": "Built."}, headers=rt)

    # Review requests changes → task goes back to Build with rework_count 1
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["role"] == "review"
    await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome", json={
        "outcome": "build_complete", "summary": "Missing tests.", "verdict": "changes_requested",
        "documents": [{"kind": "review", "title": "Review", "body": "- Blocking: no tests"}],
    }, headers=rt)
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["role"] == "build"
    assert "no tests" in payload["bundle"]["docs/REVIEW.md"]
    task = (await client.get(f"/api/projects/{pid}/tasks", headers=auth_headers)).json()[0]
    assert task["rework_count"] == 1


async def test_request_changes_reruns_stage(client: AsyncClient, auth_headers: dict):
    pid, task_id, _ = await _spec_project(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    run = await _wait_for_gate(client, auth_headers, task_id, "Refine spec")

    resp = await client.post(f"/api/task-runs/{run['id']}/reject", json={"note": "Mention PDF is out of scope"},
                             headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "failed"
    comments = (await client.get(f"/api/tasks/{task_id}/comments", headers=auth_headers)).json()
    assert any(c["action_flag"] == "changes_requested" and "PDF" in c["body"] for c in comments)

    # The stage runs again and gates again — a fresh attempt
    for _ in range(75):
        runs = (await client.get(f"/api/tasks/{task_id}/runs", headers=auth_headers)).json()
        fresh = [r for r in runs if r["approval_required"] and not r["approved_at"] and r["id"] != run["id"]]
        if fresh:
            break
        await asyncio.sleep(0.2)
    assert fresh and fresh[0]["attempt_number"] == 2

    # Rejecting something that isn't gated is refused
    resp = await client.post(f"/api/task-runs/{run['id']}/reject", json={}, headers=auth_headers)
    assert resp.status_code == 400


async def test_acceptance_criteria_and_documents(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={
        "title": "T", "acceptance_criteria": ["Users can sign in"]}, headers=auth_headers)
    task = resp.json()
    assert task["acceptance_criteria"][0]["source"] == "human"

    items = task["acceptance_criteria"] + [{"text": "Errors are shown", "done": False}]
    resp = await client.put(f"/api/tasks/{task['id']}/acceptance-criteria", json={"items": items}, headers=auth_headers)
    assert resp.status_code == 200
    assert [c["text"] for c in resp.json()["acceptance_criteria"]] == ["Users can sign in", "Errors are shown"]

    for body in ("v1", "v2"):
        resp = await client.post(f"/api/tasks/{task['id']}/documents",
                                 json={"kind": "plan", "title": "Plan", "body_markdown": body}, headers=auth_headers)
        assert resp.status_code == 201
    latest = (await client.get(f"/api/tasks/{task['id']}/documents", headers=auth_headers)).json()
    assert [(d["version"], d["body_markdown"], d["author_type"]) for d in latest] == [(2, "v2", "human")]
    history = (await client.get(f"/api/tasks/{task['id']}/documents?history=true", headers=auth_headers)).json()
    assert [d["version"] for d in history] == [2, 1]


def test_merge_keeps_human_criteria():
    from services.sdlc import merge_ai_criteria
    existing = [{"id": "a", "text": "Human one", "done": True, "source": "human"},
                {"id": "b", "text": "Old AI", "done": False, "source": "ai"}]
    merged = merge_ai_criteria(existing, ["human one", "New AI"])
    assert [(c["text"], c["source"]) for c in merged] == [("Human one", "human"), ("New AI", "ai")]


async def test_knowledge_base(client: AsyncClient, auth_headers: dict, project: dict):
    resp = await client.post("/api/knowledge", json={"kind": "decision", "title": "Postgres", "status": "proposed"},
                             headers=auth_headers)
    entry = resp.json()
    assert entry["number"] is None and entry["status"] == "proposed"
    resp = await client.patch(f"/api/knowledge/{entry['id']}", json={"status": "accepted"}, headers=auth_headers)
    assert resp.json()["number"] == 1 and resp.json()["label"] == "DR-0001: Postgres"

    await client.post("/api/knowledge", json={"kind": "glossary", "title": "Invoice", "body_markdown": "A bill.",
                                              "project_id": project["id"]}, headers=auth_headers)
    resp = await client.post("/api/knowledge", json={"kind": "glossary", "title": "X", "project_id": "nope"},
                             headers=auth_headers)
    assert resp.status_code == 400
    export = (await client.get(f"/api/knowledge/export?project_id={project['id']}", headers=auth_headers)).text
    assert "## Decision records" in export and "### Invoice" in export

    # Another user's org can't see or edit it
    resp = await client.post("/api/auth/signup", json={"name": "Eve", "email": "eve@test.dev", "password": "testpass123"})
    eve = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/knowledge", headers=eve)).json() == []
    assert (await client.patch(f"/api/knowledge/{entry['id']}", json={"title": "x"}, headers=eve)).status_code == 404


async def test_github_issue_import(client: AsyncClient, auth_headers: dict, project: dict, monkeypatch):
    from services import github as github_svc

    issues = [
        {"number": 7, "title": "Login breaks on Safari", "html_url": "https://github.com/acme/web/issues/7",
         "labels": [{"name": "bug"}, {"name": "P1"}],
         "body": "Steps...\n\n## Acceptance criteria\n- [ ] Safari users can log in\n- [ ] No console errors"},
        {"number": 8, "title": "Dark mode", "html_url": "https://github.com/acme/web/issues/8", "labels": [], "body": ""},
    ]

    async def fake_list(repo, token, state="open", labels=None, limit=50):
        assert repo == "acme/web"
        return issues

    monkeypatch.setattr(github_svc, "list_issues", fake_list)
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/issues/import", json={}, headers=auth_headers)
    assert resp.status_code == 400  # no repo configured yet

    resp = await client.patch(f"/api/projects/{pid}", json={"issues_repo": "https://github.com/acme/web.git"},
                              headers=auth_headers)
    assert resp.json()["issues_repo"] == "acme/web"
    resp = await client.post(f"/api/projects/{pid}/issues/import", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 2

    tasks = {t["external_id"]: t for t in (await client.get(f"/api/projects/{pid}/tasks", headers=auth_headers)).json()}
    bug = tasks["acme/web#7"]
    assert bug["type"] == "bug" and bug["priority"] == "high"
    assert bug["description"] == "Steps..."
    assert [c["text"] for c in bug["acceptance_criteria"]] == ["Safari users can log in", "No console errors"]
    assert bug["external_url"].endswith("/issues/7")

    # Re-import is idempotent
    resp = await client.post(f"/api/projects/{pid}/issues/import", json={}, headers=auth_headers)
    assert resp.json()["created"] == 0 and resp.json()["updated"] == 2


async def test_evidence_files_are_private_and_sanitized(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Evidence"}, headers=auth_headers)
    task_id = resp.json()["id"]
    _, launch = await _launch_engineer(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    run_id = (await client.post("/api/agent/poll-next-task",
                                headers={"Authorization": f"Bearer {launch['runtime_token']}"})).json()["task_run"]["id"]

    resp = await client.post("/api/artifacts/upload", data={"task_run_id": run_id, "artifact_type": "log"},
                             files={"file": ("../../evil.log", io.BytesIO(b"hello"), "text/plain")}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    art = resp.json()
    assert ".." not in art["file_path"] and art["filename"] == "evil.log"

    resp = await client.post("/api/artifacts/upload", data={"task_run_id": run_id, "artifact_type": "log"},
                             files={"file": ("x.html", io.BytesIO(b"<script>"), "text/html")}, headers=auth_headers)
    assert resp.status_code == 415

    resp = await client.get(f"/api/artifacts/{art['id']}/download", headers=auth_headers)
    assert resp.status_code == 200 and resp.content == b"hello"
    assert (await client.get(f"/api/artifacts/{art['id']}/download")).status_code == 401
    assert (await client.get(f"/uploads/{art['file_path']}")).status_code == 404

    resp = await client.post("/api/auth/signup", json={"name": "Mal", "email": "mal@test.dev", "password": "testpass123"})
    mal = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get(f"/api/artifacts/{art['id']}/download", headers=mal)).status_code == 404
    assert (await client.delete(f"/api/artifacts/{art['id']}", headers=mal)).status_code == 404
    assert task_id


async def test_preferences_and_changelog(client: AsyncClient, auth_headers: dict, project: dict):
    prefs = {"theme": "dark", "accent": "#10b981", "density": "compact"}
    resp = await client.put("/api/users/me/preferences", json={"preferences": prefs}, headers=auth_headers)
    assert resp.status_code == 200
    assert (await client.get("/api/users/me/preferences", headers=auth_headers)).json()["preferences"] == prefs
    assert (await client.get("/api/auth/me", headers=auth_headers)).json()["preferences"] == prefs

    # Regression: the changelog list endpoint referenced an undefined org
    resp = await client.get(f"/api/projects/{project['id']}/changelog", headers=auth_headers)
    assert resp.status_code == 200, resp.text
