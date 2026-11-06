from fastapi import APIRouter, HTTPException

from dependencies import DB, CurrentUser
from models.async_operation import AsyncOperation

router = APIRouter(prefix="/operations", tags=["operations"])


@router.get("/{operation_id}")
async def get_operation(operation_id: str, current_user: CurrentUser, db: DB):
    """A request started with `Prefer: respond-async`: running, or its status code and body."""
    op = await db.get(AsyncOperation, operation_id)
    if op is None or op.user_id != current_user.id:
        raise HTTPException(404, "Operation not found")
    return {"id": op.id, "status": op.status, "http_status": op.http_status, "body": op.body}
