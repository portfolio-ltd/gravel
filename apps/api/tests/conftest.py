import asyncio
import os
import tempfile

# Test environment must be pinned before importing the app/config
_tmp_db = os.path.join(tempfile.mkdtemp(prefix="gravel-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp_db}"
os.environ["REDIS_URL"] = ""
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ENCRYPTION_KEY"] = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
os.environ["RUNTIME_MODE"] = "simulated"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="gravel-test-uploads-")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from db.base import Base
from db.session import engine
from main import app  # noqa: E402  (env must be set first)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient):
    resp = await client.post("/api/auth/signup", json={
        "name": "Test Admin",
        "email": "admin@test.dev",
        "password": "testpass123",
        "role": "admin",
    })
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def project(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/projects", json={"name": "Test Project"}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()
