"""Email verification + forgot/reset password flows (email sends captured)."""
import pytest
from httpx import AsyncClient


@pytest.fixture
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    """Captures (kind, to, token) instead of sending real email."""
    captured: list[tuple[str, str, str]] = []

    async def fake_verify(to: str, token: str) -> bool:
        captured.append(("verify", to, token))
        return True

    async def fake_reset(to: str, token: str) -> bool:
        captured.append(("reset", to, token))
        return True

    import routers.auth as auth_router
    monkeypatch.setattr(auth_router, "send_verification_email", fake_verify)
    monkeypatch.setattr(auth_router, "send_password_reset_email", fake_reset)
    return captured


async def test_signup_sends_verification_and_verify_flow(client: AsyncClient, sent_emails):
    resp = await client.post("/api/auth/signup", json={
        "name": "Vera", "email": "vera@test.dev", "password": "secret123",
    })
    assert resp.status_code == 201
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    assert [(k, to) for k, to, _ in sent_emails] == [("verify", "vera@test.dev")]
    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["email_verified_at"] is None

    token = sent_emails[0][2]
    resp = await client.post("/api/auth/verify-email", json={"token": token})
    assert resp.status_code == 200, resp.text

    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["email_verified_at"] is not None

    # Bad token → 400
    resp = await client.post("/api/auth/verify-email", json={"token": "garbage"})
    assert resp.status_code == 400


async def test_resend_verification(client: AsyncClient, auth_headers: dict, sent_emails):
    sent_emails.clear()
    resp = await client.post("/api/auth/resend-verification", headers=auth_headers)
    assert resp.status_code == 202
    assert len(sent_emails) == 1 and sent_emails[0][0] == "verify"


async def test_forgot_and_reset_password(client: AsyncClient, sent_emails):
    await client.post("/api/auth/signup", json={
        "name": "Rita", "email": "rita@test.dev", "password": "oldpassword",
    })
    sent_emails.clear()

    # Unknown email gets the same 202 (no enumeration) and no email
    resp = await client.post("/api/auth/forgot-password", json={"email": "ghost@test.dev"})
    assert resp.status_code == 202
    assert sent_emails == []

    resp = await client.post("/api/auth/forgot-password", json={"email": "rita@test.dev"})
    assert resp.status_code == 202
    assert len(sent_emails) == 1 and sent_emails[0][0] == "reset"
    token = sent_emails[0][2]

    # Short password rejected
    resp = await client.post("/api/auth/reset-password", json={"token": token, "password": "short"})
    assert resp.status_code == 400

    resp = await client.post("/api/auth/reset-password", json={"token": token, "password": "newpassword9"})
    assert resp.status_code == 200, resp.text

    # Old password dead, new one works
    assert (await client.post("/api/auth/login", json={"email": "rita@test.dev", "password": "oldpassword"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": "rita@test.dev", "password": "newpassword9"})).status_code == 200

    # A verify-purpose token cannot reset a password
    resp = await client.post("/api/auth/forgot-password", json={"email": "rita@test.dev"})
    verify_style = sent_emails[-1][2]
    resp = await client.post("/api/auth/verify-email", json={"token": verify_style})
    assert resp.status_code == 400


async def test_reset_revokes_existing_sessions(client: AsyncClient, sent_emails):
    resp = await client.post("/api/auth/signup", json={
        "name": "Sess", "email": "sess@test.dev", "password": "oldpassword",
    })
    old_refresh = resp.json()["refresh_token"]
    sent_emails.clear()

    await client.post("/api/auth/forgot-password", json={"email": "sess@test.dev"})
    token = sent_emails[0][2]
    await client.post("/api/auth/reset-password", json={"token": token, "password": "brandnewpass"})

    resp = await client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert resp.status_code == 401
