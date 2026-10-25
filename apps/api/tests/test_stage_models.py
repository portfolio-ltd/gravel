"""Per-stage model selection: precedence, stage editor API, runtime payload, usage roll-up."""
import asyncio
from types import SimpleNamespace

from httpx import AsyncClient
from sqlalchemy import func, select

from config import settings
from db.session import AsyncSessionLocal
from models.token_usage import TokenUsage
from services import agent as agent_svc
from services.llm import LLMResult, provider_for_model, resolve_model
from services.token_usage import estimate_cost


def test_resolve_model_precedence():
    stage = SimpleNamespace(model="claude-haiku-5-5")
    engineer = SimpleNamespace(model_name="claude-sonnet-5-5")
    project = SimpleNamespace(default_model="gpt-5")

    assert resolve_model(stage, engineer, project) == "claude-haiku-5-5"
    assert resolve_model(SimpleNamespace(model=None), engineer, project) == "claude-sonnet-5-5"
    assert resolve_model(SimpleNamespace(model=None), None, project) == "gpt-5"
    assert resolve_model(stage, None, project) == "claude-haiku-5-5"
    assert resolve_model() == settings.DEFAULT_MODEL
    # Blank values inherit rather than win
    assert resolve_model(SimpleNamespace(model="  "), SimpleNamespace(model_name=""), project) == "gpt-5"


def test_provider_for_model():
    assert provider_for_model("claude-haiku-5-5") == "anthropic"
    assert provider_for_model("gpt-4o-mini") == "openai"
    assert provider_for_model("llama-3.3-70b-versatile") == "groq"
    assert provider_for_model("claude-some-future-model") == "anthropic"
    assert provider_for_model("mystery-model") is None


async def test_stage_model_crud(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/workflows", json={"name": "Models", "stages": [
        {"name": "Analyze", "role": "analyze", "model": "claude-haiku-5-5"},
        {"name": "Build", "role": "build"},
    ]}, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    wf = resp.json()
    analyze, build = sorted(wf["stages"], key=lambda s: s["stage_order"])
    assert analyze["model"] == "claude-haiku-5-5"
    assert build["model"] is None

    base = f"/api/workflows/{wf['id']}/stages"
    resp = await client.patch(f"{base}/{build['id']}", json={"model": " claude-opus-5-5 "}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["model"] == "claude-opus-5-5"
    # Other edits leave the model alone; blank or null resets to inherit
    resp = await client.patch(f"{base}/{build['id']}", json={"name": "Build it"}, headers=auth_headers)
    assert resp.json()["model"] == "claude-opus-5-5"
    resp = await client.patch(f"{base}/{build['id']}", json={"model": ""}, headers=auth_headers)
    assert resp.json()["model"] is None
    resp = await client.patch(f"{base}/{analyze['id']}", json={"model": None}, headers=auth_headers)
    assert resp.json()["model"] is None

    resp = await client.patch(f"{base}/{analyze['id']}", json={"model": "x" * 101}, headers=auth_headers)
    assert resp.status_code == 400

    resp = await client.post(base, json={"name": "Verify", "role": "verify", "model": "gpt-5"}, headers=auth_headers)
    assert resp.status_code == 201 and resp.json()["model"] == "gpt-5"


async def _usage_by_model(task_id: str) -> dict[str, tuple[int, int, float]]:
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(TokenUsage.model, func.sum(TokenUsage.tokens_in), func.sum(TokenUsage.tokens_out),
                   func.sum(TokenUsage.cost_usd))
            .where(TokenUsage.task_id == task_id).group_by(TokenUsage.model)
        )
        return {model: (t_in, t_out, cost) for model, t_in, t_out, cost in rows}


async def test_runtime_poll_carries_stage_model_and_usage_rolls_up(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/api/workflows", json={"name": "Cheap analyze", "stages": [
        {"name": "Analyze", "role": "analyze", "model": "claude-haiku-5-5"},
        {"name": "Build", "role": "build"},
    ]}, headers=auth_headers)
    wf = resp.json()
    resp = await client.post("/api/projects", json={
        "name": "Stage models", "workflow_id": wf["id"], "default_model": "gpt-5",
    }, headers=auth_headers)
    pid = resp.json()["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Costed", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    resp = await client.post("/api/engineers", json={
        "name": "Sonnet Sam", "template": "fullstack",
        "model_provider": "anthropic", "model_name": "claude-sonnet-4-6",
    }, headers=auth_headers)
    resp = await client.post(f"/api/engineers/{resp.json()['id']}/launch", headers=auth_headers)
    rt = {"Authorization": f"Bearer {resp.json()['runtime_token']}"}
    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)

    # Analyze: the stage's own model wins over the engineer's
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["name"] == "Analyze"
    assert (payload["model"], payload["model_provider"]) == ("claude-haiku-5-5", "anthropic")
    assert "- Model: claude-haiku-5-5" in payload["bundle"]["PROJECT_CONTEXT.md"]
    resp = await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome", json={
        "outcome": "build_complete", "summary": "analysed",
        "tokens_in": 100_000, "tokens_out": 10_000, "model": payload["model"],
    }, headers=rt)
    assert resp.status_code == 200, resp.text

    # Build inherits: engineer model beats the project default
    payload = (await client.post("/api/agent/poll-next-task", headers=rt)).json()
    assert payload["workflow_stage"]["name"] == "Build"
    assert payload["model"] == "claude-sonnet-4-6"
    resp = await client.post(f"/api/agent/task-runs/{payload['task_run']['id']}/outcome", json={
        "outcome": "build_complete", "summary": "built",
        "tokens_in": 20_000, "tokens_out": 4_000, "model": payload["model"],
    }, headers=rt)
    assert resp.status_code == 200, resp.text

    haiku = estimate_cost("claude-haiku-5-5", 100_000, 10_000)
    sonnet = estimate_cost("claude-sonnet-4-6", 20_000, 4_000)
    assert haiku != sonnet
    by_model = await _usage_by_model(task_id)
    assert set(by_model) == {"claude-haiku-5-5", "claude-sonnet-4-6"}
    assert abs(by_model["claude-haiku-5-5"][2] - haiku) < 1e-9
    assert abs(by_model["claude-sonnet-4-6"][2] - sonnet) < 1e-9

    summary = (await client.get(f"/api/tasks/{task_id}/token-summary", headers=auth_headers)).json()
    assert summary["calls"] == 2
    assert summary["tokens_in"] == 120_000 and summary["tokens_out"] == 14_000
    assert abs(summary["cost_usd"] - round(haiku + sonnet, 4)) < 1e-6
    proj = (await client.get(f"/api/projects/{pid}/token-summary", headers=auth_headers)).json()
    assert proj["calls"] == 2 and abs(proj["cost_usd"] - summary["cost_usd"]) < 1e-6


async def test_in_process_executor_uses_stage_model(client: AsyncClient, auth_headers: dict, monkeypatch):
    calls: list[str] = []

    async def fake_call_llm(provider, model, keys, prompt, **kwargs):
        calls.append(model)
        return LLMResult(text='{"outcome": "completed", "summary": "ok"}', model=model,
                         tokens_in=50_000, tokens_out=5_000)

    monkeypatch.setattr(agent_svc, "get_plain_keys", lambda user: {"anthropic": "sk-test"})
    monkeypatch.setattr(agent_svc, "call_llm", fake_call_llm)

    resp = await client.post("/api/workflows", json={"name": "In-process", "stages": [
        {"name": "Analyze", "role": "analyze", "model": "claude-haiku-5-5"},
        {"name": "Build", "role": "build"},
    ]}, headers=auth_headers)
    wf = resp.json()
    resp = await client.post("/api/projects", json={
        "name": "No runtimes", "workflow_id": wf["id"], "default_model": "claude-sonnet-5-5",
    }, headers=auth_headers)
    pid = resp.json()["id"]
    resp = await client.post(f"/api/projects/{pid}/tasks", json={"title": "Drained", "position": 0}, headers=auth_headers)
    task_id = resp.json()["id"]

    await client.post(f"/api/agent/run/{pid}", headers=auth_headers)
    for _ in range(40):
        if len(calls) >= 2 and not agent_svc.is_running(pid):
            break
        await asyncio.sleep(0.25)

    # No engineer in the in-process path: stage → project
    assert calls == ["claude-haiku-5-5", "claude-sonnet-5-5"]
    by_model = await _usage_by_model(task_id)
    assert set(by_model) == {"claude-haiku-5-5", "claude-sonnet-5-5"}
    summary = (await client.get(f"/api/tasks/{task_id}/token-summary", headers=auth_headers)).json()
    expected = estimate_cost("claude-haiku-5-5", 50_000, 5_000) + estimate_cost("claude-sonnet-5-5", 50_000, 5_000)
    assert summary["calls"] == 2 and abs(summary["cost_usd"] - round(expected, 4)) < 1e-6
