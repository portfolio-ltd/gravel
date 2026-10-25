"""
WebSocket connection manager.

With REDIS_URL set, broadcasts go through Redis pub/sub so every uvicorn
worker (and every host) fans out to its own local connections. Without it,
falls back to single-process in-memory delivery.
"""
import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from config import settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "gravel:ws:"

# project_id → set of WebSocket connections (always local to this process)
_connections: dict[str, set[WebSocket]] = defaultdict(set)
_lock = asyncio.Lock()

_redis = None
_subscriber_task: asyncio.Task | None = None


def _get_redis():
    global _redis
    if _redis is None and settings.REDIS_URL:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def _local_send(project_id: str, message: str) -> None:
    dead: list[WebSocket] = []
    for ws in list(_connections.get(project_id, set())):
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        await disconnect(project_id, ws)


async def _subscriber_loop() -> None:
    """One per process: relay Redis messages to this process's sockets."""
    redis = _get_redis()
    if redis is None:
        return
    while True:
        try:
            pubsub = redis.pubsub()
            await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
            async for msg in pubsub.listen():
                if msg.get("type") != "pmessage":
                    continue
                project_id = str(msg["channel"]).removeprefix(CHANNEL_PREFIX)
                await _local_send(project_id, msg["data"])
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("WS Redis subscriber error, retrying in 2s: %s", exc)
            await asyncio.sleep(2)


def _ensure_subscriber() -> None:
    global _subscriber_task
    if settings.REDIS_URL and (_subscriber_task is None or _subscriber_task.done()):
        _subscriber_task = asyncio.get_running_loop().create_task(_subscriber_loop())


async def connect(project_id: str, ws: WebSocket) -> None:
    _ensure_subscriber()
    async with _lock:
        _connections[project_id].add(ws)


async def disconnect(project_id: str, ws: WebSocket) -> None:
    async with _lock:
        _connections[project_id].discard(ws)
        if not _connections[project_id]:
            del _connections[project_id]


async def broadcast(project_id: str, payload: Any) -> None:
    message = json.dumps(payload)
    redis = _get_redis()
    if redis is not None:
        try:
            await redis.publish(f"{CHANNEL_PREFIX}{project_id}", message)
            return  # the subscriber loop delivers to local connections too
        except Exception as exc:
            logger.warning("WS Redis publish failed, falling back to local: %s", exc)
    await _local_send(project_id, message)
