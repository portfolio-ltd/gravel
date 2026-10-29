from datetime import datetime

from pydantic import BaseModel

from models.code_graph import CodeGraphStatus


class CodeGraphOut(BaseModel):
    project_id: str
    status: CodeGraphStatus
    repo_url: str | None = None
    ref: str | None = None
    commit_sha: str | None = None
    # {stats, stack, commands, entry_points, modules: [...], edges: [...]} — services/code_graph.py analyze()
    graph: dict | None = None
    summary_markdown: str | None = None
    error: str | None = None
    built_at: datetime | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}
