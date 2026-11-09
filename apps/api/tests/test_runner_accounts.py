"""Runner accounts: label runners by AI account, pin projects to one, usage per account."""
from httpx import AsyncClient


async def _register(client: AsyncClient, headers: dict, host: str, **body) -> dict:
    resp = await client.post("/api/runners/register", json={"host_label": host, **body}, headers=headers)
    assert resp.status_code == 201, resp.text
    reg = resp.json()
    reg["headers"] = {"Authorization": f"Bearer {reg['runtime_token']}"}
    return reg


async def _task(client: AsyncClient, headers: dict, pid: str, title: str) -> dict:
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": title, "position": 0}, headers=headers)
    return resp.json()


async def _poll(client: AsyncClient, runner: dict) -> dict | None:
    return (await client.post("/api/agent/poll-next-task", headers=runner["headers"])).json().get("task_run")


async def test_account_label_is_normalized(client: AsyncClient, auth_headers: dict):
    reg = await _register(client, auth_headers, "mbp", account="  Work  Account ")
    assert reg["account"] == "work account"
    engineers = (await client.get("/api/engineers", headers=auth_headers)).json()
    runtime = next(r for e in engineers for r in e["runtimes"] if r["id"] == reg["runtime_id"])
    assert runtime["account_label"] == "work account"


async def test_pinned_project_only_goes_to_that_account(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    resp = await client.patch(f"/api/projects/{pid}", json={"runner_account": "Work"}, headers=auth_headers)
    assert resp.json()["runner_account"] == "work"
    task = await _task(client, auth_headers, pid, "Pinned work")

    personal = await _register(client, auth_headers, "mbp-personal", account="personal")
    unlabeled = await _register(client, auth_headers, "mbp-plain")
    eng = (await client.post("/api/engineers", json={"name": "Docker", "template": "fullstack"}, headers=auth_headers)).json()
    docker = (await client.post(f"/api/engineers/{eng['id']}/launch", headers=auth_headers)).json()
    docker_headers = {"Authorization": f"Bearer {docker['runtime_token']}"}

    resp = await client.post(f"/api/projects/{pid}/tasks/{task['id']}/start", headers=auth_headers)
    assert resp.json()["executor"] == "account"
    assert resp.json()["account"] == "work" and resp.json()["account_online"] is False

    assert await _poll(client, personal) is None
    assert await _poll(client, unlabeled) is None
    assert (await client.post("/api/agent/poll-next-task", headers=docker_headers)).json().get("task_run") is None

    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert running[0]["state"] == "queued" and running[0]["runner_account"] == "work"

    work = await _register(client, auth_headers, "mbp-work", account="work")
    run = await _poll(client, work)
    assert run is not None
    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert running[0]["state"] == "running" and running[0]["runner_account"] == "work"

    await client.post(f"/api/agent/task-runs/{run['id']}/outcome", json={
        "outcome": "grooming_complete", "summary": "ok", "tokens_in": 100, "tokens_out": 20, "model": "runner/claude",
    }, headers=work["headers"])

    accounts = (await client.get("/api/overview/accounts", headers=auth_headers)).json()
    by = {a["account"]: a for a in accounts}
    assert set(by) == {"work", "personal", None}
    assert by["work"]["runs_week"] == 1
    assert by["work"]["tokens_week"] == 120
    assert by["work"]["pinned_projects"] == [project["name"]]
    assert [r["host_label"] for r in by["work"]["runners"]] == ["mbp-work"]
    assert by["personal"]["runs_week"] == 0


async def test_pinned_project_is_not_run_in_process(client: AsyncClient, auth_headers: dict, project: dict):
    """No runtime online: an unpinned task runs in-process, a pinned one waits for its account."""
    pid = project["id"]
    await client.patch(f"/api/projects/{pid}", json={"runner_account": "work"}, headers=auth_headers)
    task = await _task(client, auth_headers, pid, "Wait for me")
    resp = await client.post(f"/api/projects/{pid}/tasks/{task['id']}/start", headers=auth_headers)
    assert resp.status_code == 202
    # The drain left it alone: still queued, unclaimed
    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert [(r["task_id"], r["state"]) for r in running] == [(task["id"], "queued")]


async def test_labelled_runner_still_takes_unpinned_work(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await _task(client, auth_headers, pid, "Anyone")
    work = await _register(client, auth_headers, "mbp-work", account="work")
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert await _poll(client, work) is not None


async def test_clearing_the_pin(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await client.patch(f"/api/projects/{pid}", json={"runner_account": "work"}, headers=auth_headers)
    resp = await client.patch(f"/api/projects/{pid}", json={"runner_account": ""}, headers=auth_headers)
    assert resp.json()["runner_account"] is None


async def test_run_claimed_before_the_pin_shows_no_account(client: AsyncClient, auth_headers: dict, project: dict):
    pid = project["id"]
    await _task(client, auth_headers, pid, "Started earlier")
    eng = (await client.post("/api/engineers", json={"name": "Docker", "template": "fullstack"}, headers=auth_headers)).json()
    docker = (await client.post(f"/api/engineers/{eng['id']}/launch", headers=auth_headers)).json()
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    await client.post("/api/agent/poll-next-task", headers={"Authorization": f"Bearer {docker['runtime_token']}"})
    await client.patch(f"/api/projects/{pid}", json={"runner_account": "work"}, headers=auth_headers)
    running = (await client.get("/api/overview/running", headers=auth_headers)).json()
    assert running[0]["state"] == "running" and running[0]["runner_account"] is None
