"""Engineer runtime protocol: launch token, poll/claim, heartbeat, outcome."""
from httpx import AsyncClient


async def _launch_engineer(client: AsyncClient, headers: dict) -> tuple[str, dict]:
    resp = await client.post("/api/engineers", json={
        "name": "Runtime Rita", "template": "fullstack",
        "model_provider": "anthropic", "model_name": "claude-sonnet-4-6",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    engineer = resp.json()
    resp = await client.post(f"/api/engineers/{engineer['id']}/launch", headers=headers)
    assert resp.status_code == 201, resp.text
    launch = resp.json()
    assert launch["runtime_token"]
    return engineer["id"], launch


async def test_poll_claim_outcome_cycle(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Runtime task", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    # Launch first so the in-process executor stays out of the way
    _, launch = await _launch_engineer(client, auth_headers)
    rt_headers = {"Authorization": f"Bearer {launch['runtime_token']}"}

    resp = await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert resp.status_code == 202

    # Claim the grooming run
    resp = await client.post("/api/agent/poll-next-task", headers=rt_headers)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["task_run"]["phase"] == "grooming"
    assert payload["task"]["id"] == task_id
    assert "TASK.md" in payload["bundle"]
    assert "STAGE_INSTRUCTIONS.md" in payload["bundle"]
    run_id = payload["task_run"]["id"]

    # One run per runtime: a second poll comes back empty
    resp = await client.post("/api/agent/poll-next-task", headers=rt_headers)
    assert resp.json()["task_run"] is None

    # Heartbeats and logs use the runtime token
    resp = await client.post(f"/api/agent/task-runs/{run_id}/heartbeat", headers=rt_headers)
    assert resp.status_code == 200
    resp = await client.post(f"/api/agent/task-runs/{run_id}/logs", json={"message": "working"}, headers=rt_headers)
    assert resp.status_code == 200

    # Report the phase outcome → approval gate
    resp = await client.post(f"/api/agent/task-runs/{run_id}/outcome", json={
        "outcome": "grooming_complete", "summary": "Task is ready to build.",
    }, headers=rt_headers)
    assert resp.status_code == 200

    resp = await client.get(f"/api/tasks/{task_id}/runs", headers=auth_headers)
    run = resp.json()[0]
    assert run["outcome"] == "grooming_complete"
    assert run["approval_required"] is True

    # The claim was released — after approval the runtime can pick up the build run
    resp = await client.post(f"/api/task-runs/{run_id}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.post("/api/agent/poll-next-task", headers=rt_headers)
    assert resp.json()["task_run"]["phase"] == "build"


async def test_agent_endpoints_reject_bad_tokens(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/agent/poll-next-task")
    assert resp.status_code == 401
    resp = await client.post("/api/agent/poll-next-task", headers={"Authorization": "Bearer bogus"})
    assert resp.status_code == 401
    # A user JWT is not a runtime token
    resp = await client.post("/api/agent/poll-next-task", headers=auth_headers)
    assert resp.status_code == 401


async def test_stop_runtime_requeues_claim(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await client.post(f"/api/projects/{pid}/tasks", json={"title": "Requeue me", "position": 0}, headers=auth_headers)
    engineer_id, launch = await _launch_engineer(client, auth_headers)
    rt_headers = {"Authorization": f"Bearer {launch['runtime_token']}"}

    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    resp = await client.post("/api/agent/poll-next-task", headers=rt_headers)
    assert resp.json()["task_run"] is not None

    # Stopping the engineer requeues the claimed run and revokes the token
    resp = await client.post(f"/api/engineers/{engineer_id}/stop", headers=auth_headers)
    assert resp.status_code == 204
    resp = await client.post("/api/agent/poll-next-task", headers=rt_headers)
    assert resp.status_code == 401

    # A fresh runtime can claim the requeued run
    resp = await client.post(f"/api/engineers/{engineer_id}/launch", headers=auth_headers)
    rt2 = {"Authorization": f"Bearer {resp.json()['runtime_token']}"}
    resp = await client.post("/api/agent/poll-next-task", headers=rt2)
    assert resp.json()["task_run"] is not None
