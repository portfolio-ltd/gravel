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
