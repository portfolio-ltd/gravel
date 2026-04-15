"""
Agent service: background task runner that executes project tasks via LLM.
Uses asyncio background tasks (no Celery) per tasks.md recommendation for beta.
Max 1 concurrent run per project enforced via _running set.
"""
import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from db.session import AsyncSessionLocal
from models.project import Project, ProjectStatus
from models.task import Task, TaskStatus
from models.changelog import ChangelogEntry, ChangelogType
from models.user import User
from services.tasks import recalculate_progress
from services.users import get_plain_keys
from services import ws_manager

logger = logging.getLogger(__name__)

_running: set[str] = set()  # project_ids with active agent runs


def is_running(project_id: str) -> bool:
    return project_id in _running


async def run_agent(project_id: str, user_id: str) -> None:
    """Entry point — called as a background task."""
    if project_id in _running:
        logger.info("Agent already running for project %s", project_id)
        return
    _running.add(project_id)
    try:
        await _run_loop(project_id, user_id)
    finally:
        _running.discard(project_id)


async def _run_loop(project_id: str, user_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.tasks))
            .where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        keys = get_plain_keys(user) if user else {}

        pending = [t for t in project.tasks if t.status == TaskStatus.pending]
        pending.sort(key=lambda t: ({"high": 0, "medium": 1, "low": 2}[t.priority.value], t.position))

        for task in pending:
            # Mark in_progress
            task.status = TaskStatus.in_progress
            db.add(task)
            await db.commit()
            await ws_manager.broadcast(project_id, {
                "type": "task.updated",
                "task": {"id": task.id, "status": "in_progress"},
            })

            # Execute via LLM
            success = await _execute_task(task, project, keys)

            if success:
                task.status = TaskStatus.done
            else:
                # Retry once
                success = await _execute_task(task, project, keys)
                task.status = TaskStatus.done if success else TaskStatus.pending

            db.add(task)

            # Add changelog entry
            entry = ChangelogEntry(
                project_id=project_id,
                message=f"{'Completed' if success else 'Failed'}: {task.title}",
                type=ChangelogType.added if success else ChangelogType.changed,
            )
            db.add(entry)
            await db.commit()

            # Reload tasks for accurate progress calculation
            await db.refresh(project, ["tasks"])
            progress = await recalculate_progress(db, project)
            await db.commit()

            await ws_manager.broadcast(project_id, {
                "type": "task.updated",
                "task": {"id": task.id, "status": task.status.value},
            })
            await ws_manager.broadcast(project_id, {
                "type": "changelog.added",
                "entry": {"id": entry.id, "message": entry.message, "type": entry.type.value},
            })
            await ws_manager.broadcast(project_id, {"type": "agent.progress", "progress": progress})

        # All tasks processed — advance to QA if all done
        await db.refresh(project, ["tasks"])
        all_done = all(t.status == TaskStatus.done for t in project.tasks)
        if all_done and project.status == ProjectStatus.running:
            project.status = ProjectStatus.qa
            project.progress = 100
            db.add(project)
            await db.commit()
            await ws_manager.broadcast(project_id, {
                "type": "project.status_changed",
                "status": ProjectStatus.qa.value,
            })


async def _execute_task(task: Task, project: Project, keys: dict) -> bool:
    """
    Call LLM with task context. Returns True on success.
    In dev/no-key mode: simulates success after a short delay.
    """
    provider = _pick_provider(keys, project.default_model)
    if provider is None:
        # No keys available — simulate for demo purposes
        await asyncio.sleep(1.5)
        return True

    try:
        model = project.default_model
        prompt = (
            f"You are an AI software engineer. Complete the following task:\n\n"
            f"Title: {task.title}\n"
            f"Description: {task.description}\n\n"
            "Respond with a brief summary of what you did. Keep it under 100 words."
        )

        if provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=keys["anthropic"])
            msg = await client.messages.create(
                model=model, max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            _ = msg.content[0].text

        elif provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=keys["openai"])
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
            )
            _ = resp.choices[0].message.content

        return True
    except Exception as e:
        logger.warning("LLM call failed for task %s: %s", task.id, e)
        return False


def _pick_provider(keys: dict, model: str) -> str | None:
    if model.startswith("claude") and keys.get("anthropic"):
        return "anthropic"
    if model.startswith("gpt") and keys.get("openai"):
        return "openai"
    if model.startswith("llama") and keys.get("groq"):
        return "groq"
    # Fallback: use any available key
    if keys.get("anthropic"):
        return "anthropic"
    if keys.get("openai"):
        return "openai"
    return None
