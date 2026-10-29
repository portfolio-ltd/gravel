import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Import all models so Alembic/SQLAlchemy picks them up
import models  # noqa: F401
from config import settings
from db.base import Base
from db.session import engine
from routers import (
    agent,
    artifacts,
    auth,
    board,
    changelog,
    code_graph,
    engineers,
    files,
    harnesses,
    integrations,
    knowledge_map,
    links,
    organizations,
    prds,
    projects,
    sdlc,
    tags,
    task_runs,
    tasks,
    users,
    workflows,
    ws,
)

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if they don't exist (dev convenience — use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified.")
    yield
    await engine.dispose()


app = FastAPI(
    title="Gravel API",
    version="0.1.0",
    docs_url="/docs" if settings.SHOW_DOCS else None,
    redoc_url="/redoc" if settings.SHOW_DOCS else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request ID + structured logging middleware ────────────────────────────────
@app.middleware("http")
async def request_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    start = time.perf_counter()
    request.state.request_id = request_id
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request method=%s path=%s status=%s duration_ms=%s rid=%s",
        request.method, request.url.path, response.status_code, duration_ms, request_id,
    )
    return response


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception rid=%s: %s", getattr(request.state, "request_id", "?"), exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "code": "INTERNAL_ERROR"})


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
async def health():
    from sqlalchemy import text

    from db.session import AsyncSessionLocal
    db_ok = False
    try:
        async with AsyncSessionLocal() as s:
            await s.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    return {"status": "ok" if db_ok else "degraded", "db": db_ok}


# ── Routers ───────────────────────────────────────────────────────────────────
API = "/api"
app.include_router(auth.router,      prefix=API)
app.include_router(users.router,     prefix=API)
app.include_router(projects.router,  prefix=API)
app.include_router(tasks.router,     prefix=API)
app.include_router(changelog.router, prefix=API)
app.include_router(files.router,     prefix=API)
app.include_router(agent.router,        prefix=API)
app.include_router(integrations.router, prefix=API)
app.include_router(engineers.router,   prefix=API)
app.include_router(task_runs.router,   prefix=API)
app.include_router(board.router,       prefix=API)
app.include_router(artifacts.router,   prefix=API)
app.include_router(workflows.router,   prefix=API)
app.include_router(organizations.router, prefix=API)
app.include_router(tags.router,        prefix=API)
app.include_router(prds.router,        prefix=API)
app.include_router(sdlc.router,        prefix=API)
app.include_router(code_graph.router,  prefix=API)
app.include_router(harnesses.router,   prefix=API)
app.include_router(knowledge_map.router, prefix=API)
app.include_router(links.router,       prefix=API)
app.include_router(ws.router)  # /ws/{project_id} — no /api prefix

# Uploaded files are not served statically — evidence downloads go through the
# authenticated GET /api/artifacts/{id}/download.
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
