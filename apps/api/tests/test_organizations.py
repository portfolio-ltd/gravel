"""Organization tenancy: personal orgs, membership, enforcement, sharing."""
from httpx import AsyncClient


async def _signup(client: AsyncClient, email: str, name: str = "User") -> dict:
    resp = await client.post("/api/auth/signup", json={
        "name": name, "email": email, "password": "secret123",
    })
    assert resp.status_code in (200, 201), resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_signup_creates_personal_org(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/api/organizations", headers=auth_headers)
    assert resp.status_code == 200
    orgs = resp.json()
    assert len(orgs) == 1
    assert orgs[0]["role"] == "admin"
    assert orgs[0]["member_count"] == 1


async def test_org_crud_and_membership(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/organizations", json={"name": "Acme Team"}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    org = resp.json()
    assert org["slug"].startswith("acme-team")

    # Add a member by email (existing user)
    bob = await _signup(client, "bob@test.dev", "Bob")
    resp = await client.post(f"/api/organizations/{org['id']}/members",
                             json={"email": "bob@test.dev"}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    detail = resp.json()
    assert len(detail["members"]) == 2

    # Duplicate add → 400
    resp = await client.post(f"/api/organizations/{org['id']}/members",
                             json={"email": "bob@test.dev"}, headers=auth_headers)
    assert resp.status_code == 400

    # Bob (member) can read but not administer
    resp = await client.get(f"/api/organizations/{org['id']}", headers=bob)
    assert resp.status_code == 200
    resp = await client.patch(f"/api/organizations/{org['id']}", json={"name": "Bobs"}, headers=bob)
    assert resp.status_code == 403

    # Promote Bob → admin can rename
    bob_id = next(m["user_id"] for m in detail["members"] if m["email"] == "bob@test.dev")
    resp = await client.patch(f"/api/organizations/{org['id']}/members/{bob_id}",
                              json={"role": "admin"}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.patch(f"/api/organizations/{org['id']}", json={"name": "Acme 2"}, headers=bob)
    assert resp.status_code == 200


async def test_last_admin_guards(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/organizations", json={"name": "Solo Org"}, headers=auth_headers)
    org = resp.json()
    me = (await client.get("/api/auth/me", headers=auth_headers)).json()

    resp = await client.patch(f"/api/organizations/{org['id']}/members/{me['id']}",
                              json={"role": "member"}, headers=auth_headers)
    assert resp.status_code == 400
    resp = await client.delete(f"/api/organizations/{org['id']}/members/{me['id']}", headers=auth_headers)
    assert resp.status_code == 400


async def test_non_member_gets_404(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/organizations", json={"name": "Secret Org"}, headers=auth_headers)
    org_id = resp.json()["id"]

    outsider = await _signup(client, "outsider@test.dev")
    resp = await client.get(f"/api/organizations/{org_id}", headers=outsider)
    assert resp.status_code == 404

    # X-Org-Id enforcement on scoped endpoints
    resp = await client.get("/api/projects", headers={**outsider, "X-Org-Id": org_id})
    assert resp.status_code == 404


async def test_org_sharing_and_isolation(client: AsyncClient, auth_headers: dict, project: dict):
    """The scoping test: personal data is isolated; org members share via X-Org-Id."""
    other = await _signup(client, "teammate@test.dev", "Teammate")

    # Isolation: teammate's personal org sees nothing
    resp = await client.get("/api/projects", headers=other)
    assert resp.json() == []

    # Share: add teammate to my personal org
    my_org = (await client.get("/api/organizations", headers=auth_headers)).json()[0]
    resp = await client.post(f"/api/organizations/{my_org['id']}/members",
                             json={"email": "teammate@test.dev"}, headers=auth_headers)
    assert resp.status_code == 201

    # With the org header, the teammate sees the shared project
    resp = await client.get("/api/projects", headers={**other, "X-Org-Id": my_org["id"]})
    assert resp.status_code == 200
    assert [p["id"] for p in resp.json()] == [project["id"]]

    # Without the header they still fall back to their empty personal org
    resp = await client.get("/api/projects", headers=other)
    assert resp.json() == []

    # Board/metrics scope the same way
    resp = await client.get("/api/overview/metrics", headers={**other, "X-Org-Id": my_org["id"]})
    assert resp.json()["total_projects"] == 1
    resp = await client.get("/api/overview/metrics", headers=other)
    assert resp.json()["total_projects"] == 0


async def test_delete_org_guards(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/organizations", json={"name": "Doomed"}, headers=auth_headers)
    org_id = resp.json()["id"]

    # Org with a project can't be deleted
    resp = await client.post("/api/projects", json={"name": "Anchor"},
                             headers={**auth_headers, "X-Org-Id": org_id})
    assert resp.status_code == 201
    resp = await client.delete(f"/api/organizations/{org_id}", headers=auth_headers)
    assert resp.status_code == 400

    # Remove the project → delete succeeds
    pid = (await client.get("/api/projects", headers={**auth_headers, "X-Org-Id": org_id})).json()[0]["id"]
    await client.delete(f"/api/projects/{pid}", headers={**auth_headers, "X-Org-Id": org_id})
    resp = await client.delete(f"/api/organizations/{org_id}", headers=auth_headers)
    assert resp.status_code == 204
