from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel


class AsyncOperation(BaseModel):
    """A slow request answered in the background (services/async_operations.py).

    Holds the response the endpoint would have returned, so a client behind a
    proxy with a short timeout (Cloudflare: 100 s) can poll for it instead.
    """
    __tablename__ = "async_operations"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")  # running | done | failed
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
