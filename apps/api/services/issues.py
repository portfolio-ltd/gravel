"""GitHub Issues sync: import issues as tasks, post stage results back.

Import is idempotent — an issue already imported into the project (matched by
external_id "owner/repo#123") is updated in place rather than duplicated, and
only while it hasn't started moving through the workflow.
"""
import asyncio
import logging
import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.session import AsyncSessionLocal
from models.integration import GitIntegration
from models.project import Project
from models.task import Task, TaskPriority, TaskStatus, TaskType
from services import github as github_svc
from services.sdlc import merge_ai_criteria

logger = logging.getLogger(__name__)

_BUG_LABELS = {"bug", "defect", "incident", "hotfix", "regression"}
_PRIORITY_LABELS = {
    "p0": TaskPriority.high, "p1": TaskPriority.high, "priority: high": TaskPriority.high, "high": TaskPriority.high,
    "p3": TaskPriority.low, "priority: low": TaskPriority.low, "low": TaskPriority.low,
}
_AC_ITEM = re.compile(r"^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$")
_AC_HEADING = re.compile(r"^#{1,6}\s*acceptance criteria\s*$|^\*\*acceptance criteria\*\*:?\s*$", re.I)


async def github_token(db: AsyncSession, organization_id: str | None) -> str | None:
    """The org's first active GitHub integration token, if any."""
    if not organization_id:
        return None
    row = (await db.execute(
        select(GitIntegration).where(
            GitIntegration.organization_id == organization_id,
            GitIntegration.provider == "github",
            GitIntegration.is_active.is_(True),
            GitIntegration.access_token_encrypted.isnot(None),
        ).order_by(GitIntegration.created_at)
    )).scalars().first()
    if not row:
        return None
    try:
        return settings.fernet.decrypt(row.access_token_encrypted.encode()).decode()
    except Exception:
        logger.warning("Could not decrypt GitHub token for org %s", organization_id)
        return None


def split_acceptance_criteria(body: str) -> tuple[str, list[str]]:
    """Pull bullet/checkbox items under an 'Acceptance criteria' heading out of an issue body."""
    lines = (body or "").splitlines()
    for i, line in enumerate(lines):
        if not _AC_HEADING.match(line.strip()):
            continue
        criteria, end = [], len(lines)
        for j in range(i + 1, len(lines)):
            stripped = lines[j].strip()
            if stripped.startswith("#") or (len(stripped) > 4 and stripped.startswith("**") and stripped.endswith("**")):
                end = j
                break
            m = _AC_ITEM.match(stripped)
            if m and m.group(1).strip():
                criteria.append(m.group(1).strip())
        return "\n".join(lines[:i] + lines[end:]).strip(), criteria
    return (body or "").strip(), []


def _classify(labels: list[str]) -> tuple[TaskType, TaskPriority]:
    names = {name.lower() for name in labels}
    task_type = TaskType.bug if names & _BUG_LABELS else TaskType.feature
    if "infra" in names or "infrastructure" in names:
        task_type = TaskType.infra
    if "design" in names:
        task_type = TaskType.design
    priority = next((p for label, p in _PRIORITY_LABELS.items() if label in names), TaskPriority.medium)
    return task_type, priority


async def import_issues(db: AsyncSession, project: Project, *, state: str = "open",
                        labels: str | None = None, limit: int = 50) -> dict:
    if not project.issues_repo:
        raise ValueError("Set the project's GitHub issues repository first")
    token = await github_token(db, project.organization_id)
    issues = await github_svc.list_issues(project.issues_repo, token, state=state, labels=labels, limit=limit)

    existing = {
        t.external_id: t for t in (await db.execute(
            select(Task).where(Task.project_id == project.id, Task.external_source == "github")
        )).scalars()
    }
    max_pos = (await db.execute(
        select(func.coalesce(func.max(Task.position), -1)).where(Task.project_id == project.id)
    )).scalar_one()
    created = updated = skipped = 0
    for issue in issues:
        external_id = f"{project.issues_repo}#{issue['number']}"
        description, criteria = split_acceptance_criteria(issue.get("body") or "")
        task_type, priority = _classify([lbl.get("name", "") for lbl in issue.get("labels") or []])
        task = existing.get(external_id)
        if task:
            if task.status != TaskStatus.pending or task.workflow_stage_id:
                skipped += 1
                continue
            task.title = issue["title"][:300]
            task.description = description
            if criteria:
                task.acceptance_criteria = merge_ai_criteria(task.acceptance_criteria, criteria)
            updated += 1
            continue
        max_pos += 1
        task = Task(
            project_id=project.id, title=issue["title"][:300], description=description,
            type=task_type, priority=priority, position=max_pos,
            external_source="github", external_id=external_id, external_url=issue.get("html_url"),
        )
        if criteria:
            # Criteria written in the issue are the owner's words — keep them as human-authored
            task.acceptance_criteria = [dict(c, source="human") for c in merge_ai_criteria(None, criteria)]
        db.add(task)
        created += 1
    await db.flush()
    return {"created": created, "updated": updated, "skipped": skipped, "total": len(issues),
            "authenticated": token is not None}


def schedule_issue_comment(project: Project, task: Task, body: str) -> None:
    """Fire-and-forget comment on the task's source issue (best effort)."""
    if not (project.post_issue_comments and task.external_source == "github" and task.external_id):
        return
    repo, _, number = task.external_id.rpartition("#")
    if not repo or not number.isdigit():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_post_comment(project.organization_id, repo, int(number), body))


async def _post_comment(organization_id: str | None, repo: str, number: int, body: str) -> None:
    try:
        async with AsyncSessionLocal() as db:
            token = await github_token(db, organization_id)
        if token:
            await github_svc.post_issue_comment(repo, token, number, body)
    except Exception:
        logger.exception("Posting comment to %s#%s failed", repo, number)
