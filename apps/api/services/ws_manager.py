"""
In-process WebSocket connection manager.
For multi-worker deployments swap to Redis pub/sub (REDIS_URL in config).
"""
import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# project_id → set of WebSocket connections
_connections: dict[str, set[WebSocket]] = defaultdict(set)
_lock = asyncio.Lock()


async def connect(project_id: str, ws: WebSocket) -> None:
    async with _lock:
        _connections[project_id].add(ws)


async def disconnect(project_id: str, ws: WebSocket) -> None:
    async with _lock:
        _connections[project_id].discard(ws)
        if not _connections[project_id]:
            del _connections[project_id]


async def broadcast(project_id: str, payload: Any) -> None:
    message = json.dumps(payload)
    dead: list[WebSocket] = []
    for ws in list(_connections.get(project_id, set())):
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        await disconnect(project_id, ws)
