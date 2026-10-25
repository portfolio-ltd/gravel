from httpx import AsyncClient


async def test_project_crud_with_repo(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/projects", json={
        "name": "Repo Project",
        "repo_url": "https://github.com/acme/site",
        "default_branch": "develop",
    }, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    project = resp.json()
    assert project["repo_url"] == "https://github.com/acme/site"
    assert project["default_branch"] == "develop"

    resp = await client.patch(f"/api/projects/{project['id']}", json={"default_branch": "main"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["default_branch"] == "main"


async def test_projects_scoped_to_owner(client: AsyncClient, auth_headers: dict, project: dict):
    resp = await client.post("/api/auth/signup", json={
        "name": "Other", "email": "other@test.dev", "password": "secret123",
    })
    other_headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    resp = await client.get("/api/projects", headers=other_headers)
    assert resp.status_code == 200
    assert resp.json() == []

    resp = await client.get("/api/projects", headers=auth_headers)
    assert len(resp.json()) == 1


async def test_task_crud_and_progress(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    ids = []
    for i in range(2):
        resp = await client.post(f"/api/projects/{pid}/tasks", json={
            "title": f"Task {i}", "description": "d", "position": i,
        }, headers=auth_headers)
        assert resp.status_code == 201, resp.text
        ids.append(resp.json()["id"])

    resp = await client.patch(f"/api/projects/{pid}/tasks/{ids[0]}", json={"status": "done"}, headers=auth_headers)
    assert resp.status_code == 200

    resp = await client.get(f"/api/projects/{pid}", headers=auth_headers)
    assert resp.json()["progress"] == 50


async def test_board_and_metrics(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await client.post(f"/api/projects/{pid}/tasks", json={"title": "T", "position": 0}, headers=auth_headers)

    resp = await client.get("/api/board", headers=auth_headers)
    assert resp.status_code == 200
    cols = {c["status"]: len(c["tasks"]) for c in resp.json()["columns"]}
    assert cols["pending"] == 1

    resp = await client.get("/api/overview/metrics", headers=auth_headers)
    assert resp.status_code == 200
    m = resp.json()
    assert m["total_projects"] == 1 and m["total_tasks"] == 1
