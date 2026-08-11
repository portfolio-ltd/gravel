"""Custom workflow stage engine: gates, checkpoints, rework loops, targeting."""
import asyncio

from httpx import AsyncClient


async def _wait_for_gated_run(client: AsyncClient, headers: dict, task_id: str, timeout: float = 10.0):
    for _ in range(int(timeout / 0.25)):
        resp = await client.get(f"/api/tasks/{task_id}/runs", headers=headers)
        runs = resp.json()
        gated = [r for r in runs if r["approval_required"] and not r["approved_at"]]
        if gated:
            return gated[0], runs
        await asyncio.sleep(0.25)
    raise AssertionError(f"No gated run appeared for task {task_id}: {runs}")


async def _make_workflow(client: AsyncClient, headers: dict, stages: list[dict], name: str = "Custom Flow") -> dict:
    resp = await client.post("/api/workflows", json={"name": name, "stages": stages}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _make_wf_project(client: AsyncClient, headers: dict, workflow_id: str, title: str = "Stage task") -> tuple[str, str]:
    resp = await client.post("/api/projects", json={"name": f"P-{workflow_id[:6]}", "workflow_id": workflow_id}, headers=headers)
    assert resp.status_code == 201, resp.text
    pid = resp.json()["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": title, "position": 0}, headers=headers)
    task_id = resp.json()["id"]
    return pid, task_id


async def test_full_stage_flow_with_checkpoint_and_review_gate(client: AsyncClient, auth_headers: dict):
    wf = await _make_workflow(client, auth_headers, [
        {"name": "Groom", "is_ai_executable": True},
        {"name": "Checkpoint", "is_ai_executable": False, "requires_human_approval": True},
        {"name": "Review Build", "is_ai_executable": True, "requires_human_approval": True},
        {"name": "Finalize", "is_ai_executable": True},
    ])
    pid, task_id = await _make_wf_project(client, auth_headers, wf["id"])

    resp = await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    assert resp.status_code == 202

    # Groom auto-advances (no approval flag); the non-AI Checkpoint parks gated
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)
    assert run["outcome"] == "needs_human_input"
    assert "Manual stage 'Checkpoint'" in run["blocking_reason"]

    resp = await client.get("/api/overview/attention-tasks", headers=auth_headers)
    assert any(a["task_id"] == task_id for a in resp.json())

    # Approving the checkpoint advances to Review Build, which gates on completion
    resp = await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    run, _ = await _wait_for_gated_run(client, auth_headers, task_id)
    assert run["outcome"] == "build_complete"
    assert "Review Build" in run["blocking_reason"]

    # Approve → Finalize runs and completes without a gate → task done
    await client.post(f"/api/task-runs/{run['id']}/approve", json={}, headers=auth_headers)
    for _ in range(40):
        resp = await client.get(f"/api/projects/{pid}", headers=auth_headers)
        task = next(t for t in resp.json()["tasks"] if t["id"] == task_id)
        if task["status"] == "done":
            break
        await asyncio.sleep(0.25)
    assert task["status"] == "done"
    assert resp.json()["progress"] == 100

    # Per-project board renders stage-named lanes with the task in Done
    resp = await client.get(f"/api/projects/{pid}/board", headers=auth_headers)
    cols = resp.json()["columns"]
    assert [c["label"] for c in cols] == ["Groom", "Checkpoint", "Review Build", "Finalize", "Done"]
    done_col = cols[-1]
    assert done_col["status"] == "done"
    assert any(t["id"] == task_id for t in done_col["tasks"])


async def test_status_patch_blocked_on_workflow_projects(client: AsyncClient, auth_headers: dict):
    wf = await _make_workflow(client, auth_headers, [{"name": "Only", "is_ai_executable": True}], name="Guard Flow")
    pid, task_id = await _make_wf_project(client, auth_headers, wf["id"])
    resp = await client.patch(f"/api/projects/{pid}/tasks/{task_id}", json={"status": "done"}, headers=auth_headers)
    assert resp.status_code == 400


async def _launch_engineer(client: AsyncClient, headers: dict, name: str) -> tuple[str, dict]:
    resp = await client.post("/api/engineers", json={"name": name, "template": "fullstack"}, headers=headers)
    engineer = resp.json()
    resp = await client.post(f"/api/engineers/{engineer['id']}/launch", headers=headers)
    assert resp.status_code == 201, resp.text
    return engineer["id"], {"Authorization": f"Bearer {resp.json()['runtime_token']}"}


async def test_rework_loop_and_engineer_targeting(client: AsyncClient, auth_headers: dict):
    eng_a, rt_a = await _launch_engineer(client, auth_headers, "Stage Runner A")
    eng_b, rt_b = await _launch_engineer(client, auth_headers, "Stage Runner B")

    wf = await _make_workflow(client, auth_headers, [
        {"name": "Build", "is_ai_executable": True, "assigned_engineer_id": eng_a,
         "stage_instructions": "Implement exactly what TASK.md asks for."},
        {"name": "QA", "is_ai_executable": True, "assigned_engineer_id": eng_a, "max_rework_attempts": 2},
    ], name="Rework Flow")
    build_id, qa_id = (s["id"] for s in wf["stages"])
    resp = await client.patch(f"/api/workflows/{wf['id']}/stages/{qa_id}",
                              json={"rework_target_stage_id": build_id}, headers=auth_headers)
    assert resp.status_code == 200

    pid, task_id = await _make_wf_project(client, auth_headers, wf["id"], title="Reworked feature")
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    # Engineer targeting: B gets nothing, A claims the Build run
    resp = await client.post("/api/agent/poll-next-task", headers=rt_b)
    assert resp.json()["task_run"] is None
    resp = await client.post("/api/agent/poll-next-task", headers=rt_a)
    payload = resp.json()
    assert payload["workflow_stage"]["name"] == "Build"
    assert "Implement exactly what TASK.md asks for." in payload["bundle"]["STAGE_INSTRUCTIONS.md"]
    run_id = payload["task_run"]["id"]

    # Build completes (no approval flag) → auto-advance to QA
    resp = await client.post(f"/api/agent/task-runs/{run_id}/outcome",
                             json={"outcome": "build_complete", "summary": "done"}, headers=rt_a)
    assert resp.status_code == 200

    # QA fails → rework #1 back to Build
    resp = await client.post("/api/agent/poll-next-task", headers=rt_a)
    payload = resp.json()
    assert payload["workflow_stage"]["name"] == "QA"
    await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                      json={"outcome": "failed", "summary": "tests failed"}, headers=rt_a)

    resp = await client.get(f"/api/projects/{pid}", headers=auth_headers)
    task = next(t for t in resp.json()["tasks"] if t["id"] == task_id)
    assert task["workflow_stage_id"] == build_id
    assert task["rework_count"] == 1

    resp = await client.get(f"/api/tasks/{task_id}/comments", headers=auth_headers)
    assert any("Rework #1" in c["body"] and "Build" in c["body"] for c in resp.json())

    # The re-queued Build run carries attempt_number 2
    resp = await client.post("/api/agent/poll-next-task", headers=rt_a)
    payload = resp.json()
    assert payload["workflow_stage"]["name"] == "Build"
    assert payload["task_run"]["attempt_number"] == 2
    await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome",
                      json={"outcome": "build_complete", "summary": "done again"}, headers=rt_a)

    # QA fails again → rework budget exhausted → gated for human attention
    resp = await client.post("/api/agent/poll-next-task", headers=rt_a)
    qa_run_id = resp.json()["task_run"]["id"]
    await client.post(f"/api/agent/task-runs/{qa_run_id}/outcome",
                      json={"outcome": "failed", "summary": "still failing"}, headers=rt_a)

    resp = await client.get(f"/api/tasks/{task_id}/runs", headers=auth_headers)
    gated = [r for r in resp.json() if r["approval_required"] and not r["approved_at"]]
    assert len(gated) == 1 and gated[0]["id"] == qa_run_id

    resp = await client.get("/api/overview/attention-tasks", headers=auth_headers)
    assert any(a["run_id"] == qa_run_id for a in resp.json())

    # No new claimable run was created
    resp = await client.post("/api/agent/poll-next-task", headers=rt_a)
    assert resp.json()["task_run"] is None
