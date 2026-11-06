"""API tokens, device login, local runners and keyless model calls through a runner."""
import asyncio
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from config import settings
from db.session import AsyncSessionLocal
from models.engineer import EngineerRuntime
from models.project import Project
from services import runners
from services.llm import call_llm, pick_provider


async def _token(client: AsyncClient, headers: dict, name: str = "laptop") -> dict:
    resp = await client.post("/api/users/me/tokens", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _register(client: AsyncClient, token: str, **body) -> dict:
    resp = await client.post("/api/runners/register", json={"host_label": "mbp", **body},
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── API tokens and device login ───────────────────────────────────────────────

async def test_api_token_authenticates_until_revoked(client: AsyncClient, auth_headers: dict):
    created = await _token(client, auth_headers)
    assert created["token"].startswith("grv_") and created["prefix"] == created["token"][:12]
    bearer = {"Authorization": f"Bearer {created['token']}"}
    assert (await client.get("/api/auth/me", headers=bearer)).json()["email"] == "admin@test.dev"

    listed = (await client.get("/api/users/me/tokens", headers=auth_headers)).json()
    assert [t["name"] for t in listed] == ["laptop"] and "token" not in listed[0]

    assert (await client.delete(f"/api/users/me/tokens/{created['id']}", headers=auth_headers)).status_code == 204
    assert (await client.get("/api/auth/me", headers=bearer)).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer grv_nope"})).status_code == 401


async def test_device_login_flow(client: AsyncClient, auth_headers: dict):
    start = (await client.post("/api/auth/device/start", json={"client_name": "gravel CLI"})).json()
    assert start["verification_uri_complete"].endswith(f"/cli?code={start['user_code']}")
    poll = {"device_code": start["device_code"]}
    assert (await client.post("/api/auth/device/token", json=poll)).json() == {"status": "pending"}

    # The signed-in user looks the code up (any spacing/case) and approves it
    loose = start["user_code"].replace("-", " ").lower()
    info = (await client.get(f"/api/auth/device/{loose}", headers=auth_headers)).json()
    assert info["client_name"] == "gravel CLI" and info["status"] == "pending"
    resp = await client.post("/api/auth/device/decision", json={"user_code": loose, "approve": True}, headers=auth_headers)
    assert resp.status_code == 200, resp.text

    granted = (await client.post("/api/auth/device/token", json=poll)).json()
    assert granted["status"] == "approved" and granted["access_token"].startswith("grv_")
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {granted['access_token']}"})
    assert me.status_code == 200
    # The token is handed out once
    assert (await client.post("/api/auth/device/token", json=poll)).json() == {"status": "expired"}

    # A denied login never yields a token
    other = (await client.post("/api/auth/device/start", json={})).json()
    await client.post("/api/auth/device/decision", json={"user_code": other["user_code"], "approve": False},
                      headers=auth_headers)
    assert (await client.post("/api/auth/device/token", json={"device_code": other["device_code"]})).json() == {"status": "denied"}
    assert (await client.get(f"/api/auth/device/{start['user_code']}", headers=auth_headers)).status_code == 404


# ── Local runners ─────────────────────────────────────────────────────────────

async def test_personal_runner_only_takes_its_owners_runs(client: AsyncClient, auth_headers: dict):
    token = (await _token(client, auth_headers))["token"]
    mine = (await client.post("/api/projects", json={"name": "Mine"}, headers=auth_headers)).json()
    theirs = (await client.post("/api/projects", json={"name": "Teammate's"}, headers=auth_headers)).json()
    for p in (mine, theirs):
        await client.post(f"/api/projects/{p['id']}/tasks", json={"title": f"Task in {p['name']}"}, headers=auth_headers)
    async with AsyncSessionLocal() as db:  # hand one project to someone else in the org
        project = await db.get(Project, theirs["id"])
        project.owner_id = "someone-else"
        await db.commit()

    runner = await _register(client, token, executor="codex")
    assert runner["scope"] == "mine" and runner["engineer_name"] == "Test's mbp"
    rt = {"Authorization": f"Bearer {runner['runtime_token']}"}
    for p in (mine, theirs):
        assert (await client.post(f"/api/agent/run/{p['id']}", headers=auth_headers)).status_code == 202

    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["project"]["id"] == mine["id"]
    await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                      json={"outcome": "grooming_complete", "summary": "ok"}, headers=rt)
    assert (await client.post("/api/agent/poll-next-task", headers=rt)).json()["task_run"] is None

    # The engineers list shows it as an online local runner; stopping takes it offline
    engineers = (await client.get("/api/engineers", headers=auth_headers)).json()
    local = next(r for e in engineers for r in e["runtimes"] if r["id"] == runner["runtime_id"])
    assert local["kind"] == "local" and local["online"] and local["executor"] == "codex"
    assert (await client.post("/api/agent/runner/stop", headers=rt)).status_code == 204
    assert (await client.post("/api/agent/poll-next-task", headers=rt)).status_code == 401


async def test_stale_runner_is_offline(client: AsyncClient, auth_headers: dict):
    token = (await _token(client, auth_headers))["token"]
    runner = await _register(client, token, scope="org")
    async with AsyncSessionLocal() as db:
        rt = await db.get(EngineerRuntime, runner["runtime_id"])
        assert rt.online
        rt.started_at = rt.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        await db.commit()
        rt = await db.get(EngineerRuntime, runner["runtime_id"])
        assert not rt.online
        user_id = rt.owner_user_id
        assert await runners.online_local_runner(db, user_id) is None
        assert "runner" not in await runners.llm_keys(db, await db.get(runners.User, user_id))


async def test_keyless_model_call_goes_through_the_runner(client: AsyncClient, auth_headers: dict, monkeypatch):
    monkeypatch.setattr(settings, "RUNNER_JOB_TIMEOUT_SECONDS", 15)
    token = (await _token(client, auth_headers))["token"]
    runner = await _register(client, token)
    rt = {"Authorization": f"Bearer {runner['runtime_token']}"}
    async with AsyncSessionLocal() as db:
        user = await db.get(runners.User, (await db.get(EngineerRuntime, runner["runtime_id"])).owner_user_id)
        keys = await runners.llm_keys(db, user)
    assert keys == {"runner": user.id} and pick_provider(keys, "claude-opus-5-5") == "runner"

    async def fake_runner():
        for _ in range(40):
            job = (await client.post("/api/agent/poll-next-job", headers=rt)).json()["job"]
            if job:
                assert job["prompt"] == "Split this PRD" and job["json_schema"] == {"type": "object"}
                resp = await client.post(f"/api/agent/jobs/{job['id']}/result",
                                         json={"text": '{"ok": true}', "tokens_in": 10, "tokens_out": 3}, headers=rt)
                assert resp.status_code == 204
                return
            await asyncio.sleep(0.25)
        raise AssertionError("no job appeared")

    result, _ = await asyncio.gather(
        call_llm("runner", "claude-opus-5-5", keys, "Split this PRD", json_schema={"type": "object"}),
        fake_runner(),
    )
    assert result.text == '{"ok": true}' and result.model == "runner/claude-opus-5-5" and result.tokens_in == 10


async def test_keyless_runs_wait_for_the_runner(client: AsyncClient, auth_headers: dict):
    token = (await _token(client, auth_headers))["token"]
    runner = await _register(client, token)
    rt = {"Authorization": f"Bearer {runner['runtime_token']}"}
    await client.post("/api/agent/runner/stop", headers=rt)  # set up once, now offline

    project = (await client.post("/api/projects", json={"name": "Keyless"}, headers=auth_headers)).json()
    task = (await client.post(f"/api/projects/{project['id']}/tasks", json={"title": "Wait"}, headers=auth_headers)).json()
    await client.post(f"/api/agent/run/{project['id']}", headers=auth_headers)
    await asyncio.sleep(1.5)
    runs = (await client.get(f"/api/tasks/{task['id']}/runs", headers=auth_headers)).json()
    assert len(runs) == 1 and runs[0]["claimed_at"] is None and runs[0]["outcome"] is None  # not simulated

    # The runner comes back and picks it up
    again = await _register(client, token)
    payload = (await client.post("/api/agent/poll-next-task",
                                 headers={"Authorization": f"Bearer {again['runtime_token']}"})).json()
    assert payload["task"]["id"] == task["id"]


async def test_restarting_on_the_same_machine_retires_the_old_runner(client: AsyncClient, auth_headers: dict):
    token = (await _token(client, auth_headers))["token"]
    first = await _register(client, token)
    second = await _register(client, token)
    elsewhere = await _register(client, token, host_label="desktop")
    async with AsyncSessionLocal() as db:
        assert not (await db.get(EngineerRuntime, first["runtime_id"])).is_active
        assert (await db.get(EngineerRuntime, second["runtime_id"])).is_active
        assert (await db.get(EngineerRuntime, elsewhere["runtime_id"])).is_active
    old = {"Authorization": f"Bearer {first['runtime_token']}"}
    assert (await client.post("/api/agent/poll-next-task", headers=old)).status_code == 401
