"""Long requests without long connections.

Some calls can outlast a proxy's timeout — Cloudflare drops a request after
100 s, and a PRD parse or chat answered by a big model, or by the user's own
runner (services/runners.py), can take longer. A client that sends
`Prefer: respond-async` on one of the ASYNC_PATHS gets `202 {operation_id}`
at once; the request then runs in the background through the same app
(same auth, same dependencies, same response) and its status code and JSON
body land in an AsyncOperation that `GET /api/operations/{id}` returns.
Requests without the header are untouched.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from db.session import AsyncSessionLocal
from models.async_operation import AsyncOperation

logger = logging.getLogger(__name__)

ASYNC_PATHS = [
    re.compile(r"^/api/agent/parse$"),
    re.compile(r"^/api/prds/[^/]+/(chat|split)$"),
]
KEEP_FOR = timedelta(days=1)
_tasks: set[asyncio.Task] = set()  # keep background tasks referenced until they finish


def _wants_async(scope) -> bool:
    if scope["type"] != "http" or scope["method"] != "POST":
        return False
    if not any(p.match(scope["path"]) for p in ASYNC_PATHS):
        return False
    headers = dict(scope.get("headers") or [])
    return b"respond-async" in headers.get(b"prefer", b"").lower()


async def _user_id(scope) -> str | None:
    from services.api_tokens import TOKEN_PREFIX, user_for_token
    from services.auth import decode_access_token
    auth = dict(scope.get("headers") or []).get(b"authorization", b"").decode()
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if token.startswith(TOKEN_PREFIX):
        async with AsyncSessionLocal() as db:
            user = await user_for_token(db, token)
            await db.commit()
            return user.id if user else None
    return decode_access_token(token)


async def _read_body(receive) -> bytes:
    body, more = b"", True
    while more:
        message = await receive()
        body += message.get("body", b"")
        more = message.get("more_body", False)
    return body


def _replay(body: bytes):
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        await asyncio.Event().wait()  # the client never disconnects from a background call
    return receive


async def _send_json(send, status: int, payload: dict) -> None:
    raw = json.dumps(payload).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(raw)).encode())]})
    await send({"type": "http.response.body", "body": raw})


class AsyncOperationsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if not _wants_async(scope):
            return await self.app(scope, receive, send)
        body = await _read_body(receive)
        user_id = await _user_id(scope)
        if user_id is None:  # let the endpoint answer 401 as usual
            return await self.app(scope, _replay(body), send)

        async with AsyncSessionLocal() as db:
            await db.execute(delete(AsyncOperation).where(
                AsyncOperation.created_at < datetime.now(timezone.utc) - KEEP_FOR))
            op = AsyncOperation(user_id=user_id, method=scope["method"], path=scope["path"], status="running")
            db.add(op)
            await db.commit()
            op_id = op.id
        task = asyncio.get_running_loop().create_task(self._run(op_id, dict(scope), body))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
        await _send_json(send, 202, {"operation_id": op_id, "status": "running",
                                     "poll": f"/api/operations/{op_id}"})

    async def _run(self, op_id: str, scope, body: bytes) -> None:
        status, chunks = 500, []

        async def capture(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))

        try:
            await self.app(scope, _replay(body), capture)
            raw = b"".join(chunks)
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = {"detail": raw.decode(errors="replace")[:2000]}
            result = ("done", status, payload)
        except Exception as exc:  # the endpoint crashed: report it like a 500
            logger.exception("async operation %s failed", op_id)
            result = ("failed", 500, {"detail": f"Internal error: {exc}"})
        async with AsyncSessionLocal() as db:
            op = await db.get(AsyncOperation, op_id)
            if op is not None:
                op.status, op.http_status, op.body = result
                await db.commit()
