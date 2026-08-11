import json

import pytest
from httpx import AsyncClient

from services.llm import LLMResult


async def _prd(client: AsyncClient, headers: dict, title: str = "Payments PRD") -> dict:
    resp = await client.post("/api/prds", json={
        "title": title, "summary": "Add payments", "body_markdown": "# Payments\n\nSupport cards.",
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_prd_crud_and_status_filter(client: AsyncClient, auth_headers: dict):
    prd = await _prd(client, auth_headers)
    assert prd["status"] == "draft"

    resp = await client.patch(f"/api/prds/{prd['id']}", json={"status": "in_review"}, headers=auth_headers)
    assert resp.json()["status"] == "in_review"

    assert len((await client.get("/api/prds?status=in_review", headers=auth_headers)).json()) == 1
    assert (await client.get("/api/prds?status=draft", headers=auth_headers)).json() == []

    resp = await client.post(f"/api/prds/{prd['id']}/comments", json={"body": "Looks good"}, headers=auth_headers)
    assert resp.status_code == 201
    listing = (await client.get("/api/prds", headers=auth_headers)).json()
    assert listing[0]["comment_count"] == 1


async def test_prd_chat_with_mocked_llm(client: AsyncClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch):
    prd = await _prd(client, auth_headers, title="Chat PRD")

    async def fake_call_llm(provider, model, keys, prompt, max_tokens=1000, json_mode=False):
        return LLMResult(
            text=json.dumps({"reply": "I tightened the scope.", "updated_body": "# Payments v2\n\nCards only."}),
            model=model, tokens_in=1200, tokens_out=300,
        )

    import services.prds as prd_service
    monkeypatch.setattr(prd_service, "pick_provider", lambda keys, model: "anthropic")
    monkeypatch.setattr(prd_service, "call_llm", fake_call_llm)

    resp = await client.post(f"/api/prds/{prd['id']}/chat",
                             json={"message": "Trim the scope to cards"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reply"] == "I tightened the scope."
    assert body["updated_body"].startswith("# Payments v2")
    assert body["tokens_in"] == 1200

    # Both sides of the exchange persisted
    comments = (await client.get(f"/api/prds/{prd['id']}/comments", headers=auth_headers)).json()
    assert [c["author_type"] for c in comments] == ["human", "ai"]

    # Usage recorded against the PRD
    summary = (await client.get(f"/api/prds/{prd['id']}/token-summary", headers=auth_headers)).json()
    assert summary["calls"] == 1 and summary["tokens_in"] == 1200


async def test_prd_chat_without_key_400(client: AsyncClient, auth_headers: dict):
    prd = await _prd(client, auth_headers, title="No-key PRD")
    resp = await client.post(f"/api/prds/{prd['id']}/chat", json={"message": "hi"}, headers=auth_headers)
    assert resp.status_code == 400
    assert "API key" in resp.json()["detail"]


async def test_prd_chat_malformed_output_falls_back(client: AsyncClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch):
    prd = await _prd(client, auth_headers, title="Fallback PRD")

    async def fake_call_llm(provider, model, keys, prompt, max_tokens=1000, json_mode=False):
        return LLMResult(text="Sure, here are my thoughts without JSON.", model=model, tokens_in=10, tokens_out=10)

    import services.prds as prd_service
    monkeypatch.setattr(prd_service, "pick_provider", lambda keys, model: "anthropic")
    monkeypatch.setattr(prd_service, "call_llm", fake_call_llm)

    resp = await client.post(f"/api/prds/{prd['id']}/chat", json={"message": "hi"}, headers=auth_headers)
    body = resp.json()
    assert body["reply"] == "Sure, here are my thoughts without JSON."
    assert body["updated_body"] is None


async def test_prd_convert(client: AsyncClient, auth_headers: dict):
    prd = await _prd(client, auth_headers, title="Convert PRD")
    p1 = (await client.post("/api/projects", json={"name": "Conv A"}, headers=auth_headers)).json()
    p2 = (await client.post("/api/projects", json={"name": "Conv B"}, headers=auth_headers)).json()

    resp = await client.post(f"/api/prds/{prd['id']}/convert", json={
        "project_ids": [p1["id"], p2["id"]],
        "task_titles": ["Card form", "Charge endpoint", "Receipts"],
    }, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["created_count"] == 6

    tasks = (await client.get(f"/api/projects/{p1['id']}/tasks", headers=auth_headers)).json()
    assert len(tasks) == 3
    assert "From PRD: Convert PRD" in tasks[0]["description"]

    assert (await client.get(f"/api/prds/{prd['id']}", headers=auth_headers)).json()["status"] == "converted"


async def test_prd_split_with_mocked_parser(client: AsyncClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch):
    prd = await _prd(client, auth_headers, title="Split PRD")

    async def fake_parse(text, model, keys):
        return [{"title": "Task A"}, {"title": "Task B"}], None

    import services.parser as parser
    monkeypatch.setattr(parser, "parse_prd_text", fake_parse)

    resp = await client.post(f"/api/prds/{prd['id']}/split", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["task_titles"] == ["Task A", "Task B"]


async def test_prds_scoped_to_org(client: AsyncClient, auth_headers: dict):
    await _prd(client, auth_headers, title="Private PRD")
    resp = await client.post("/api/auth/signup", json={
        "name": "Other", "email": "other-prd@test.dev", "password": "secret123",
    })
    other = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/prds", headers=other)).json() == []
