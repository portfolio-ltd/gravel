import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from db.session import AsyncSessionLocal
from models.project import Project
from services.auth import decode_access_token, get_user_by_id
from services import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...),
):
    # Authenticate via token query param
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    async with AsyncSessionLocal() as db:
        user = await get_user_by_id(db, user_id)
        if not user:
            await websocket.close(code=4001)
            return

        await websocket.accept()
        await ws_manager.connect(project_id, websocket)

        # Send initial project snapshot
        try:
            result = await db.execute(
                select(Project)
                .options(selectinload(Project.tasks), selectinload(Project.changelog))
                .where(Project.id == project_id)
            )
            p = result.scalar_one_or_none()
            if p:
                snapshot = {
                    "type": "snapshot",
                    "project": {
                        "id": p.id,
                        "status": p.status.value,
                        "progress": p.progress,
                        "tasks": [
                            {"id": t.id, "title": t.title, "status": t.status.value, "position": t.position}
                            for t in p.tasks
                        ],
                    },
                }
                await websocket.send_text(json.dumps(snapshot))
        except Exception as e:
            logger.warning("WS snapshot failed: %s", e)

    try:
        while True:
            # Keep connection alive — just receive (clients may send pings)
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(project_id, websocket)
