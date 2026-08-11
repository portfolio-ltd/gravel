"""End-to-end orchestration: agent run → approval gates → done (simulated executor)."""
import asyncio

from httpx import AsyncClient


async def _wait_for_gated_run(client: AsyncClient, headers: dict, task_id: str, timeout: float = 10.0):
    """The in-process executor runs as a background task — poll until it gates."""
    for _ in range(int(timeout / 0.25)):
        resp = await client.get(f"/api/tasks/{task_id}/runs", headers=headers)
        runs = resp.json()
        gated = [r for r in runs if r["approval_required"] and not r["approved_at"]]
        if gated:
            return gated[0], runs
        await asyncio.sleep(0.25)
    raise AssertionError(f"No gated run appeared for task {task_id}: {runs}")


async def test_full_phase_flow_with_gates(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Ship feature", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    # Kick off the agent — no engineer runtimes exist, so the in-process executor drains
    resp = await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert resp.status_code == 202, resp.text

    # Phase 1: grooming completes and parks behind an approval gate
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)
    assert run["phase"] == "grooming"
    assert run["outcome"] == "grooming_complete"

    # The gate shows up on the attention surface
    resp = await client.get("/api/overview/attention-tasks", headers=auth_headers)
    assert any(a["task_id"] == task_id for a in resp.json())

    # Approve grooming → build runs → gates again
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)
    assert run["phase"] == "build"
    assert run["outcome"] == "build_complete"

    # Approve build → testing runs → gates
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)
    assert run["phase"] == "testing"

    # Approve testing → no deploy environment configured → task is done
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    for _ in range(20):
        resp = await client.get(f"/api/projects/{pid}", headers=auth_headers)
        task = next(t for t in resp.json()["tasks"] if t["id"] == task_id)
        if task["status"] == "done":
            break
        await asyncio.sleep(0.25)
    assert task["status"] == "done"
    assert resp.json()["progress"] == 100


async def test_reject_returns_task_to_pending(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Risky change", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)

    resp = await client.post(f"/api/task-runs/{run['id']}/reject", json={"note": "not good"}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["outcome"] == "failed"
    assert body["approval_required"] is False

    resp = await client.get(f"/api/projects/{pid}", headers=auth_headers)
    task = next(t for t in resp.json()["tasks"] if t["id"] == task_id)
    assert task["status"] == "pending"

    # Rejected runs leave the attention list
    resp = await client.get("/api/overview/attention-tasks", headers=auth_headers)
    assert not any(a["run_id"] == run["id"] for a in resp.json())
