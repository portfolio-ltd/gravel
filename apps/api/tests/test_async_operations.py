"""Long requests answered in the background (Prefer: respond-async)."""
import asyncio

from httpx import AsyncClient

ASYNC = {"Prefer": "respond-async"}


async def _poll(client: AsyncClient, headers: dict, url: str) -> dict:
    for _ in range(60):
        op = (await client.get(url, headers=headers)).json()
        if op["status"] != "running":
            return op
        await asyncio.sleep(0.1)
    raise AssertionError("operation never finished")


async def test_long_request_returns_202_then_the_real_response(client: AsyncClient, auth_headers: dict):
    prd = (await client.post("/api/prds", json={"title": "Invoices", "body_markdown": "Export as CSV."},
                             headers=auth_headers)).json()
    started = await client.post(f"/api/prds/{prd['id']}/split", headers={**auth_headers, **ASYNC})
    assert started.status_code == 202 and started.json()["poll"] == f"/api/operations/{started.json()['operation_id']}"
    op = await _poll(client, auth_headers, started.json()["poll"])
    assert op["status"] == "done" and op["http_status"] == 200 and op["body"]["task_titles"]

    # Same call without the header is unchanged
    plain = await client.post(f"/api/prds/{prd['id']}/split", headers=auth_headers)
    assert plain.status_code == 200 and plain.json() == op["body"]


async def test_errors_are_kept_and_operations_are_private(client: AsyncClient, auth_headers: dict):
    started = await client.post("/api/prds/nope/chat", json={"message": "hi"}, headers={**auth_headers, **ASYNC})
    op = await _poll(client, auth_headers, started.json()["poll"])
    assert op["http_status"] == 404 and op["body"] == {"detail": "PRD not found"}

    other = await client.post("/api/auth/signup", json={"name": "Eve", "email": "eve@test.dev",
                                                       "password": "testpass123", "role": "admin"})
    eve = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(started.json()["poll"], headers=eve)).status_code == 404


async def test_only_listed_paths_and_signed_in_users_go_async(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/projects", json={"name": "Not async"}, headers={**auth_headers, **ASYNC})
    assert resp.status_code == 201
    resp = await client.post("/api/prds/x/split", headers=ASYNC)
    assert resp.status_code == 401
