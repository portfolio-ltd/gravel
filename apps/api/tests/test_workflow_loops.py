"""Loop engineering: named, bounded loops between a start stage and a check stage."""
from httpx import AsyncClient


async def _workflow(client: AsyncClient, headers: dict, name: str, stages: list[str]) -> dict:
    resp = await client.post("/api/workflows", json={"name": name, "stages": [
        {"name": n, "is_ai_executable": True} for n in stages
    ]}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _engineer(client: AsyncClient, headers: dict, name: str) -> dict:
    resp = await client.post("/api/engineers", json={"name": name, "template": "fullstack"}, headers=headers)
    resp = await client.post(f"/api/engineers/{resp.json()['id']}/launch", headers=headers)
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['runtime_token']}"}


async def _project(client: AsyncClient, headers: dict, workflow_id: str) -> tuple[str, str]:
    resp = await client.post("/api/projects", json={"name": f"Loop-{workflow_id[:6]}", "workflow_id": workflow_id},
                             headers=headers)
    pid = resp.json()["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Make it green", "position": 0},
                             headers=headers)
    return pid, resp.json()["id"]


async def _poll(client: AsyncClient, rt: dict, stage: str) -> dict:
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"] and payload["workflow_stage"]["name"] == stage, payload
    return payload


async def _report(client: AsyncClient, rt: dict, run_id: str, outcome: str, summary: str = "done") -> None:
    resp = await client.post(f"/api/agent/task-runs/{run_id}/outcome",
                             json={"outcome": outcome, "summary": summary}, headers=rt)
    assert resp.status_code == 200, resp.text


async def test_loop_crud_and_validation(client: AsyncClient, auth_headers: dict):
    wf = await _workflow(client, auth_headers, "Loop CRUD", ["Build", "Test"])
    other = await _workflow(client, auth_headers, "Loop CRUD other", ["Elsewhere"])
    build, test = (s["id"] for s in wf["stages"])
    url = f"/api/workflows/{wf['id']}/loops"

    resp = await client.post(url, json={"name": "Green", "entry_stage_id": build,
                                        "check_stage_id": other["stages"][0]["id"]}, headers=auth_headers)
    assert resp.status_code == 400
    resp = await client.post(url, json={"name": "Green", "entry_stage_id": build, "check_stage_id": test,
                                        "max_iterations": 99}, headers=auth_headers)
    assert resp.status_code == 422

    resp = await client.post(url, json={"name": "Green", "goal": "  All tests pass  ", "entry_stage_id": build,
                                        "check_stage_id": test, "max_iterations": 4}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    loop = resp.json()
    assert loop["goal"] == "All tests pass" and loop["on_exhausted"] == "ask_human" and loop["carry_feedback"]

    resp = await client.post(url, json={"name": "Dup", "entry_stage_id": build, "check_stage_id": test},
                             headers=auth_headers)
    assert resp.status_code == 409

    resp = await client.patch(f"{url}/{loop['id']}", json={"max_cost_usd": 2.5, "on_exhausted": "proceed"},
                              headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["max_cost_usd"] == 2.5
    resp = await client.patch(f"{url}/{loop['id']}", json={"max_cost_usd": None}, headers=auth_headers)
    assert resp.json()["max_cost_usd"] is None and resp.json()["on_exhausted"] == "proceed"

    resp = await client.get(f"/api/workflows/{wf['id']}", headers=auth_headers)
    assert [x["name"] for x in resp.json()["loops"]] == ["Green"]

    # Deleting either end deletes the loop
    resp = await client.delete(f"/api/workflows/{wf['id']}/stages/{test}", headers=auth_headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/workflows/{wf['id']}", headers=auth_headers)
    assert resp.json()["loops"] == []


async def test_template_comes_with_its_loop(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/workflows/from-template", json={"template_key": "build-until-green"},
                             headers=auth_headers)
    assert resp.status_code == 201, resp.text
    wf = resp.json()
    by_name = {s["name"]: s["id"] for s in wf["stages"]}
    (loop,) = wf["loops"]
    assert loop["entry_stage_id"] == by_name["Build"] and loop["check_stage_id"] == by_name["Test"]
    assert loop["max_iterations"] == 5


async def test_loop_iterates_with_feedback_then_asks_a_human(client: AsyncClient, auth_headers: dict):
    rt = await _engineer(client, auth_headers, "Loop Runner")
    wf = await _workflow(client, auth_headers, "Green Flow", ["Build", "Test", "Ship"])
    build, test, _ = (s["id"] for s in wf["stages"])
    resp = await client.post(f"/api/workflows/{wf['id']}/loops", json={
        "name": "Green", "goal": "All tests pass", "entry_stage_id": build, "check_stage_id": test,
        "max_iterations": 2,
    }, headers=auth_headers)
    assert resp.status_code == 201
    pid, task_id = await _project(client, auth_headers, wf["id"])
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    # Pass 1
    payload = await _poll(client, rt, "Build")
    assert "pass 1 of at most 2" in payload["bundle"]["LOOP.md"]
    assert "All tests pass" in payload["bundle"]["LOOP.md"]
    assert payload["task_run"]["loop_iteration"] == 1
    await _report(client, rt, payload["task_run"]["id"], "build_complete")
    payload = await _poll(client, rt, "Test")
    assert "Your part: the check" in payload["bundle"]["LOOP.md"]
    assert payload["task_run"]["loop_iteration"] == 1
    await _report(client, rt, payload["task_run"]["id"], "failed", "2 tests failing in test_auth.py")

    # The check failed → pass 2 starts at Build with the findings in the thread
    payload = await _poll(client, rt, "Build")
    assert payload["task_run"]["loop_iteration"] == 2
    assert "pass 2 of at most 2" in payload["bundle"]["LOOP.md"]
    comments = (await client.get(f"/api/tasks/{task_id}/comments", headers=auth_headers)).json()
    assert any("Starting pass 2" in c["body"] and "2 tests failing" in c["body"] for c in comments)
    await _report(client, rt, payload["task_run"]["id"], "build_complete")
    payload = await _poll(client, rt, "Test")
    await _report(client, rt, payload["task_run"]["id"], "failed", "1 test failing")

    # Exhausted → parked for a human
    runs = (await client.get(f"/api/tasks/{task_id}/runs", headers=auth_headers)).json()
    gated = [r for r in runs if r["approval_required"] and not r["approved_at"]]
    assert len(gated) == 1
    assert "Loop 'Green' stopped — 2 of 2 passes ran" in gated[0]["blocking_reason"]

    # Approving starts a fresh round at the loop's start
    resp = await client.post(f"/api/task-runs/{gated[0]['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    payload = await _poll(client, rt, "Build")
    assert payload["task_run"]["loop_iteration"] == 1

    # This time the check passes → the task leaves the loop for Ship, outside any loop
    await _report(client, rt, payload["task_run"]["id"], "build_complete")
    payload = await _poll(client, rt, "Test")
    await _report(client, rt, payload["task_run"]["id"], "testing_complete")
    payload = await _poll(client, rt, "Ship")
    assert payload["task_run"]["loop_id"] is None
    assert "LOOP.md" not in payload["bundle"]


async def test_exhausted_loop_can_proceed(client: AsyncClient, auth_headers: dict):
    rt = await _engineer(client, auth_headers, "Proceed Runner")
    wf = await _workflow(client, auth_headers, "Polish Flow", ["Polish", "Ship"])
    polish = wf["stages"][0]["id"]
    # A one-stage loop: the stage is both start and check
    resp = await client.post(f"/api/workflows/{wf['id']}/loops", json={
        "name": "Polish", "entry_stage_id": polish, "check_stage_id": polish,
        "max_iterations": 1, "on_exhausted": "proceed",
    }, headers=auth_headers)
    assert resp.status_code == 201
    pid, task_id = await _project(client, auth_headers, wf["id"])
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    payload = await _poll(client, rt, "Polish")
    await _report(client, rt, payload["task_run"]["id"], "failed", "still rough")
    await _poll(client, rt, "Ship")
    comments = (await client.get(f"/api/tasks/{task_id}/comments", headers=auth_headers)).json()
    assert any("set to proceed" in c["body"] and "still rough" in c["body"] for c in comments)
