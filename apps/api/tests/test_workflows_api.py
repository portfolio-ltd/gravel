from httpx import AsyncClient


async def _create_workflow(client: AsyncClient, headers: dict, name: str = "Pipeline A") -> dict:
    resp = await client.post("/api/workflows", json={
        "name": name,
        "description": "test workflow",
        "stages": [
            {"name": "Plan", "is_ai_executable": True},
            {"name": "Gate", "is_ai_executable": False, "requires_human_approval": True},
            {"name": "Build", "is_ai_executable": True, "requires_human_approval": True},
        ],
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_with_inline_stages(client: AsyncClient, auth_headers: dict):
    wf = await _create_workflow(client, auth_headers)
    assert [s["name"] for s in wf["stages"]] == ["Plan", "Gate", "Build"]
    assert [s["stage_order"] for s in wf["stages"]] == [0, 1, 2]

    resp = await client.post("/api/workflows", json={"name": "Pipeline A"}, headers=auth_headers)
    assert resp.status_code == 409


async def test_stage_crud_and_validation(client: AsyncClient, auth_headers: dict):
    wf = await _create_workflow(client, auth_headers)
    wf_id = wf["id"]
    plan, gate, build = wf["stages"]

    # Append a stage without explicit order → max+1
    resp = await client.post(f"/api/workflows/{wf_id}/stages", json={"name": "QA"}, headers=auth_headers)
    assert resp.status_code == 201
    qa = resp.json()
    assert qa["stage_order"] == 3

    # Rework target must be in the same workflow and not self
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/{qa['id']}",
                              json={"rework_target_stage_id": qa["id"]}, headers=auth_headers)
    assert resp.status_code == 400
    other = await _create_workflow(client, auth_headers, name="Pipeline B")
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/{qa['id']}",
                              json={"rework_target_stage_id": other["stages"][0]["id"]}, headers=auth_headers)
    assert resp.status_code == 400
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/{qa['id']}",
                              json={"rework_target_stage_id": build["id"]}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["rework_target_stage_id"] == build["id"]

    # Explicit null clears the field
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/{qa['id']}",
                              json={"rework_target_stage_id": None}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["rework_target_stage_id"] is None


async def test_reorder_route_not_shadowed(client: AsyncClient, auth_headers: dict):
    """Regression for the DevBoss bug: 'reorder' parsed as a stage_id → 422."""
    wf = await _create_workflow(client, auth_headers)
    wf_id = wf["id"]
    ids = [s["id"] for s in wf["stages"]]
    resp = await client.patch(f"/api/workflows/{wf_id}/stages/reorder", json={
        "stages": [
            {"id": ids[0], "stage_order": 2},
            {"id": ids[1], "stage_order": 0},
            {"id": ids[2], "stage_order": 1},
        ],
    }, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    names = [s["name"] for s in resp.json()["stages"]]
    assert names == ["Gate", "Build", "Plan"]


async def test_delete_stage_clears_sibling_targets(client: AsyncClient, auth_headers: dict):
    wf = await _create_workflow(client, auth_headers)
    wf_id = wf["id"]
    plan, gate, build = wf["stages"]
    await client.patch(f"/api/workflows/{wf_id}/stages/{build['id']}",
                       json={"rework_target_stage_id": plan["id"]}, headers=auth_headers)

    resp = await client.delete(f"/api/workflows/{wf_id}/stages/{plan['id']}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/api/workflows/{wf_id}", headers=auth_headers)
    build_after = next(s for s in resp.json()["stages"] if s["id"] == build["id"])
    assert build_after["rework_target_stage_id"] is None


async def test_delete_workflow_in_use_409(client: AsyncClient, auth_headers: dict):
    wf = await _create_workflow(client, auth_headers)
    resp = await client.post("/api/projects", json={"name": "WF Project", "workflow_id": wf["id"]}, headers=auth_headers)
    assert resp.status_code == 201, resp.text

    resp = await client.delete(f"/api/workflows/{wf['id']}", headers=auth_headers)
    assert resp.status_code == 409

    # Detach, then delete succeeds
    project_id = (await client.get("/api/projects", headers=auth_headers)).json()[0]["id"]
    resp = await client.patch(f"/api/projects/{project_id}", json={"workflow_id": None}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.delete(f"/api/workflows/{wf['id']}", headers=auth_headers)
    assert resp.status_code == 204


async def test_workflows_scoped_to_owner(client: AsyncClient, auth_headers: dict):
    await _create_workflow(client, auth_headers)
    resp = await client.post("/api/auth/signup", json={
        "name": "Other", "email": "other-wf@test.dev", "password": "secret123",
    })
    other = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/workflows", headers=other)).json() == []
