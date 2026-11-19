from httpx import AsyncClient


async def test_signup_login_me(client: AsyncClient):
    resp = await client.post("/api/auth/signup", json={
        "name": "Alice", "email": "alice@test.dev", "password": "secret123", "role": "developer",
    })
    assert resp.status_code in (200, 201), resp.text
    tokens = resp.json()
    assert tokens["access_token"] and tokens["refresh_token"]

    resp = await client.post("/api/auth/login", json={"email": "alice@test.dev", "password": "secret123"})
    assert resp.status_code == 200
    access = resp.json()["access_token"]

    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@test.dev"


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/auth/signup", json={
        "name": "Bob", "email": "bob@test.dev", "password": "secret123",
    })
    resp = await client.post("/api/auth/login", json={"email": "bob@test.dev", "password": "wrong"})
    assert resp.status_code == 401


async def test_refresh_rotation(client: AsyncClient):
    resp = await client.post("/api/auth/signup", json={
        "name": "Cara", "email": "cara@test.dev", "password": "secret123",
    })
    refresh = resp.json()["refresh_token"]
    resp = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert resp.json()["access_token"]

    # Rotation: the presented token is spent; the returned one keeps the session alive
    rotated = resp.json()["refresh_token"]
    assert rotated and rotated != refresh
    assert (await client.post("/api/auth/refresh", json={"refresh_token": refresh})).status_code == 401
    assert (await client.post("/api/auth/refresh", json={"refresh_token": rotated})).status_code == 200


async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_signup_cannot_grant_itself_admin(client: AsyncClient, auth_headers: dict):
    """The first account is the instance admin; a later signup asking for admin is a developer."""
    me = (await client.get("/api/auth/me", headers=auth_headers)).json()
    assert me["role"] == "admin"
    resp = await client.post("/api/auth/signup", json={
        "name": "Mallory", "email": "mallory@test.dev", "password": "testpass123", "role": "admin"})
    assert resp.status_code == 201
    mallory = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/auth/me", headers=mallory)).json()["role"] == "developer"
    assert (await client.get("/api/users", headers=mallory)).status_code == 403
    # Other roles are still the person's own choice
    resp = await client.post("/api/auth/signup", json={
        "name": "Pat", "email": "pat@test.dev", "password": "testpass123", "role": "product"})
    pat = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/auth/me", headers=pat)).json()["role"] == "product"


async def test_deactivating_a_user_cuts_off_tokens_and_runners(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/auth/signup", json={"name": "Temp", "email": "temp@test.dev", "password": "testpass123"})
    session = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    refresh = resp.json()["refresh_token"]
    user_id = (await client.get("/api/auth/me", headers=session)).json()["id"]
    token = (await client.post("/api/users/me/tokens", json={"name": "cli"}, headers=session)).json()["token"]
    bearer = {"Authorization": f"Bearer {token}"}
    runner = (await client.post("/api/runners/register", json={"host_label": "x", "scope": "org"}, headers=bearer)).json()
    rt = {"Authorization": f"Bearer {runner['runtime_token']}"}
    assert (await client.post("/api/agent/poll-next-task", headers=rt)).status_code == 200

    assert (await client.delete(f"/api/users/{user_id}", headers=auth_headers)).status_code == 204
    assert (await client.get("/api/auth/me", headers=session)).status_code == 401
    assert (await client.get("/api/auth/me", headers=bearer)).status_code == 401
    assert (await client.post("/api/agent/poll-next-task", headers=rt)).status_code == 401
    assert (await client.post("/api/auth/refresh", json={"refresh_token": refresh})).status_code == 401
