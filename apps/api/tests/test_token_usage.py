"""Token ledger: runtime self-reporting, summaries, metrics."""
from httpx import AsyncClient


async def _launch(client: AsyncClient, headers: dict) -> dict:
    resp = await client.post("/api/engineers", json={"name": "Token Runner", "template": "fullstack"}, headers=headers)
    eng = resp.json()
    resp = await client.post(f"/api/engineers/{eng['id']}/launch", headers=headers)
    return {"Authorization": f"Bearer {resp.json()['runtime_token']}"}


async def test_runtime_outcome_records_usage(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Costed", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    rt = await _launch(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    run_id = payload["task_run"]["id"]

    resp = await client.post(f"/api/agent/task-runs/{run_id}/outcome", json={
        "outcome": "grooming_complete", "summary": "ready",
        "tokens_in": 10_000, "tokens_out": 2_000, "model": "claude-sonnet-4-6",
    }, headers=rt)
    assert resp.status_code == 200, resp.text

    # Task summary: 10k in / 2k out, cost from the price map (3.00/15.00 per 1M)
    summary = (await client.get(f"/api/tasks/{task_id}/token-summary", headers=auth_headers)).json()
    assert summary["tokens_in"] == 10_000
    assert summary["tokens_out"] == 2_000
    assert abs(summary["cost_usd"] - (10_000 * 3.0 + 2_000 * 15.0) / 1_000_000) < 1e-6
    assert summary["calls"] == 1

    # Project + metrics roll it up
    proj = (await client.get(f"/api/projects/{pid}/token-summary", headers=auth_headers)).json()
    assert proj["tokens_in"] == 10_000
    metrics = (await client.get("/api/overview/metrics", headers=auth_headers)).json()
    assert metrics["total_tokens"] == 12_000
    assert metrics["total_cost_usd"] > 0


async def test_outcome_without_usage_still_works(client: AsyncClient, auth_headers: dict, project: dict):
    """Old runtimes that omit the usage fields keep working."""
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Free", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    rt = await _launch(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()

    resp = await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                             json={"outcome": "grooming_complete", "summary": "ok"}, headers=rt)
    assert resp.status_code == 200

    summary = (await client.get(f"/api/tasks/{task_id}/token-summary", headers=auth_headers)).json()
    assert summary["calls"] == 0 and summary["cost_usd"] == 0
