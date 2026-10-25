from httpx import AsyncClient


async def _tag(client: AsyncClient, headers: dict, name: str, color: str = "#3b82f6") -> dict:
    resp = await client.post("/api/tags", json={"name": name, "color": color}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_tag_crud_and_dup(client: AsyncClient, auth_headers: dict):
    tag = await _tag(client, auth_headers, "Bug", "#ef4444")
    resp = await client.post("/api/tags", json={"name": "Bug"}, headers=auth_headers)
    assert resp.status_code == 409

    resp = await client.patch(f"/api/tags/{tag['id']}", json={"color": "#000000"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["color"] == "#000000"

    resp = await client.get("/api/tags", headers=auth_headers)
    assert [t["name"] for t in resp.json()] == ["Bug"]


async def test_task_tags_replace_set(client: AsyncClient, auth_headers: dict, project: dict):
    resp = await client.post(f"/api/projects/{project['id']}/tasks",
                             json={"title": "Tagged task", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]
    t1 = await _tag(client, auth_headers, "Sprint 1")
    t2 = await _tag(client, auth_headers, "Feature", "#22c55e")

    # Set two
    resp = await client.patch(f"/api/tasks/{task_id}/tags",
                              json={"tag_ids": [t1["id"], t2["id"]]}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert sorted(t["name"] for t in resp.json()["tags"]) == ["Feature", "Sprint 1"]

    # Shrink to one
    resp = await client.patch(f"/api/tasks/{task_id}/tags", json={"tag_ids": [t2["id"]]}, headers=auth_headers)
    assert [t["name"] for t in resp.json()["tags"]] == ["Feature"]

    # Tags surface on the board payload
    resp = await client.get("/api/board", headers=auth_headers)
    board_task = next(t for c in resp.json()["columns"] for t in c["tasks"] if t["id"] == task_id)
    assert [t["name"] for t in board_task["tags"]] == ["Feature"]

    # Clear
    resp = await client.patch(f"/api/tasks/{task_id}/tags", json={"tag_ids": []}, headers=auth_headers)
    assert resp.json()["tags"] == []

    # Unknown/cross-org id → 400
    resp = await client.patch(f"/api/tasks/{task_id}/tags", json={"tag_ids": ["nope"]}, headers=auth_headers)
    assert resp.status_code == 400


async def test_tag_delete_cascades(client: AsyncClient, auth_headers: dict, project: dict):
    resp = await client.post(f"/api/projects/{project['id']}/tasks",
                             json={"title": "T", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]
    tag = await _tag(client, auth_headers, "Doomed")
    await client.patch(f"/api/tasks/{task_id}/tags", json={"tag_ids": [tag["id"]]}, headers=auth_headers)

    resp = await client.delete(f"/api/tags/{tag['id']}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/projects/{project['id']}/tasks", headers=auth_headers)
    task = next(t for t in resp.json() if t["id"] == task_id)
    assert task["tags"] == []


async def test_tag_admin_gating(client: AsyncClient, auth_headers: dict):
    # A plain member of the org cannot create tags
    resp = await client.post("/api/auth/signup", json={
        "name": "Member", "email": "member-tags@test.dev", "password": "secret123",
    })
    member = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    my_org = (await client.get("/api/organizations", headers=auth_headers)).json()[0]
    await client.post(f"/api/organizations/{my_org['id']}/members",
                      json={"email": "member-tags@test.dev"}, headers=auth_headers)

    resp = await client.post("/api/tags", json={"name": "Nope"},
                             headers={**member, "X-Org-Id": my_org["id"]})
    assert resp.status_code == 403
    resp = await client.get("/api/tags", headers={**member, "X-Org-Id": my_org["id"]})
    assert resp.status_code == 200
