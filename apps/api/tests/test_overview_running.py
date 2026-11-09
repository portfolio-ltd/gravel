"""Home dashboard feeds: runs in flight and the weekly figures on /overview/metrics."""
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from db.session import AsyncSessionLocal
from models.task_run import TaskRun, TaskRunOutcome, TaskRunPhase


async def _launch(client: AsyncClient, headers: dict, name: str = "Sprout") -> dict:
    eng = (await client.post("/api/engineers", json={"name": name, "template": "fullstack"}, headers=headers)).json()
    resp = await client.post(f"/api/engineers/{eng['id']}/launch", headers=headers)
    return {"Authorization": f"Bearer {resp.json()['runtime_token']}"}


async def test_running_lists_queued_then_claimed_runs(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await client.post(f"/api/projects/{pid}/tasks", json={"title": "Research savings apps", "position": 0},
                      headers=auth_headers)
    rt = await _launch(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert len(running) == 1
    item = running[0]
    assert item["state"] == "queued"
    assert item["started_at"] is None and item["engineer_name"] is None
    assert item["task_title"] == "Research savings apps"
    assert item["project_name"] == project["name"]
    assert (item["stage_name"], item["stage_index"], item["stage_count"]) == ("grooming", 1, 4)
    assert item["typical_seconds"] is None  # no history yet: no estimate is shown

    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    run_id = payload["task_run"]["id"]
    item = (await client.get("/api/overview/running", headers=auth_headers)).json()[0]
    assert item["run_id"] == run_id
    assert item["state"] == "running"
    assert item["engineer_name"] == "Sprout"
    assert item["started_at"] and item["stale"] is False

    metrics = (await client.get("/api/overview/metrics", headers=auth_headers)).json()
    assert metrics["runs_active"] == 1

    await client.post(f"/api/agent/task-runs/{run_id}/outcome", json={
        "outcome": "grooming_complete", "summary": "ready",
        "tokens_in": 10_000, "tokens_out": 2_000, "model": "claude-sonnet-4-6",
    }, headers=rt)
    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert run_id not in [r["run_id"] for r in running]

    metrics = (await client.get("/api/overview/metrics", headers=auth_headers)).json()
    assert metrics["stages_completed_week"] == 1
    assert metrics["stages_completed_prev_week"] == 0
    assert metrics["cost_usd_week"] > 0 and metrics["cost_usd_prev_week"] == 0
    assert metrics["agent_seconds_week"] >= 0


async def test_stale_and_typical_duration(client: AsyncClient, auth_headers: dict, project: dict):
    """A quiet claimed run is flagged; the estimate is the median of recent finished runs."""
    pid = project["id"]
    task = (await client.post(f"/api/projects/{pid}/tasks", json={"title": "Plan", "position": 0},
                              headers=auth_headers)).json()
    rt = await _launch(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    run_id = (await client.post("/api/agent/poll-next-task", headers=rt)).json()["task_run"]["id"]

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        for minutes in (4, 6, 50):  # median 6 minutes, not skewed by the outlier
            start = now - timedelta(days=1, minutes=minutes)
            db.add(TaskRun(task_id=task["id"], phase=TaskRunPhase.grooming,
                           outcome=TaskRunOutcome.grooming_complete,
                           started_at=start, claimed_at=start, completed_at=now - timedelta(days=1)))
        # One finished 10 days ago lands in the previous week
        old = now - timedelta(days=10)
        db.add(TaskRun(task_id=task["id"], phase=TaskRunPhase.build, outcome=TaskRunOutcome.build_complete,
                       started_at=old - timedelta(minutes=30), claimed_at=old - timedelta(minutes=30),
                       completed_at=old))
        live = await db.get(TaskRun, run_id)
        live.last_heartbeat_at = now - timedelta(minutes=10)
        await db.commit()

    item = (await client.get("/api/overview/running", headers=auth_headers)).json()[0]
    assert item["stale"] is True
    assert item["typical_seconds"] == 6 * 60

    metrics = (await client.get("/api/overview/metrics", headers=auth_headers)).json()
    assert metrics["stages_completed_week"] == 3
    assert metrics["stages_completed_prev_week"] == 1
    assert metrics["agent_seconds_week"] == (4 + 6 + 50) * 60
    assert metrics["agent_seconds_prev_week"] == 30 * 60


async def test_running_is_org_scoped(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await client.post(f"/api/projects/{pid}/tasks", json={"title": "Private", "position": 0}, headers=auth_headers)
    await _launch(client, auth_headers)
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    resp = await client.post("/api/auth/signup", json={
        "name": "Outsider", "email": "outsider@test.dev", "password": "testpass123",
    })
    other = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/overview/running", headers=other)).json() == []
