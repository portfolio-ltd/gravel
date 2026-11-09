"""POST /projects/{id}/tasks/{task_id}/start queues one task, not the whole project."""
from httpx import AsyncClient


async def _task(client: AsyncClient, headers: dict, pid: str, title: str, **extra) -> dict:
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": title, "position": 0, **extra}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _launch(client: AsyncClient, headers: dict) -> None:
    eng = (await client.post("/api/engineers", json={"name": "Runner", "template": "fullstack"}, headers=headers)).json()
    await client.post(f"/api/engineers/{eng['id']}/launch", headers=headers)


async def test_start_queues_only_that_task(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    other = await _task(client, auth_headers, pid, "Leave me alone")
    mine = await _task(client, auth_headers, pid, "Start me")
    await _launch(client, auth_headers)  # a runtime is online, so nothing runs in-process

    resp = await client.post(f"/api/projects/{pid}/tasks/{mine['id']}/start", headers=auth_headers)
    assert resp.status_code == 202, resp.text
    assert resp.json()["executor"] == "runtime"

    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert [r["task_id"] for r in running] == [mine["id"]]
    assert other["id"] not in [r["task_id"] for r in running]

    detail = (await client.get(f"/api/projects/{pid}", headers=auth_headers)).json()
    assert detail["status"] == "running"

    again = await client.post(f"/api/projects/{pid}/tasks/{mine['id']}/start", headers=auth_headers)
    assert again.status_code == 409


async def test_start_waits_for_dependencies(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    first = await _task(client, auth_headers, pid, "Schema")
    second = await _task(client, auth_headers, pid, "API", depends_on=[first["id"]])
    resp = await client.post(f"/api/projects/{pid}/tasks/{second['id']}/start", headers=auth_headers)
    assert resp.status_code == 409
    assert "Schema" in resp.json()["detail"]


async def test_start_without_runtime_uses_in_process_executor(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    task = await _task(client, auth_headers, pid, "Simulated")
    resp = await client.post(f"/api/projects/{pid}/tasks/{task['id']}/start", headers=auth_headers)
    assert resp.status_code == 202
    assert resp.json()["executor"] == "in_process"


async def test_start_is_org_scoped(client: AsyncClient, auth_headers: dict, project: dict):
    task = await _task(client, auth_headers, project["id"], "Private")
    resp = await client.post("/api/auth/signup", json={
        "name": "Outsider", "email": "outsider@test.dev", "password": "testpass123",
    })
    other = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    resp = await client.post(f"/api/projects/{project['id']}/tasks/{task['id']}/start", headers=other)
    assert resp.status_code == 404
