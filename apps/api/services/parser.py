"""
PRD parser: reads PRD text and calls LLM to extract a structured task list.
Returns (list of {title, description, priority, type} dicts, LLMResult | None).
"""
import json
import logging
import re
from pathlib import Path

from services.llm import LLMResult, call_llm, pick_provider

logger = logging.getLogger(__name__)

PARSE_PROMPT = """You are a product manager AI. Given this PRD document, extract a prioritized list of engineering tasks.

Return ONLY a valid JSON array (no markdown fences, no extra text) in this format:
[
  {{
    "title": "Short action-oriented title (max 80 chars)",
    "description": "What needs to be built/done (1-3 sentences)",
    "priority": "high|medium|low",
    "type": "feature|bug|design|infra"
  }}
]

Aim for 5–15 tasks. Prioritize by impact.

PRD content:
---
{prd_text}
---"""


def _read_prd(file_path: str) -> str:
    try:
        return Path(file_path).read_text(errors="ignore")[:8000]
    except Exception:
        return ""


async def parse_prd(
    prd_file_path: str,
    model: str,
    keys: dict,
) -> tuple[list[dict], LLMResult | None]:
    """File-reading wrapper around parse_prd_text."""
    return await parse_prd_text(_read_prd(prd_file_path), model, keys)


async def parse_prd_text(
    prd_text: str,
    model: str,
    keys: dict,
) -> tuple[list[dict], LLMResult | None]:
    if not prd_text:
        return _fallback_tasks(), None

    provider = pick_provider(keys, model)
    if provider is None:
        return _fallback_tasks(), None

    prompt = PARSE_PROMPT.format(prd_text=prd_text[:8000])
    try:
        result = await call_llm(provider, model, keys, prompt, max_tokens=2000)
        tasks = _extract_json(result.text)
        return (tasks if tasks else _fallback_tasks()), result
    except Exception as e:
        logger.warning("PRD parse failed: %s", e)
        return _fallback_tasks(), None


def _extract_json(text: str) -> list[dict] | None:
    # Strip markdown fences if present
    text = re.sub(r"```(?:json)?", "", text).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        # Some models wrap in {"tasks": [...]}
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    return v
    except Exception:
        pass
    return None


def _fallback_tasks() -> list[dict]:
    """Demo tasks when no LLM key is available."""
    return [
        {"title": "Setup project structure & CI/CD pipeline", "description": "Initialize repo, configure linting and test pipeline.", "priority": "high", "type": "infra"},
        {"title": "Design system & component library", "description": "Create base button, input, card, modal components.", "priority": "high", "type": "design"},
        {"title": "Authentication (JWT + refresh tokens)", "description": "Implement login, logout, refresh token rotation.", "priority": "high", "type": "feature"},
        {"title": "Dashboard layout & navigation", "description": "Responsive sidebar and top nav.", "priority": "high", "type": "feature"},
        {"title": "User profile management", "description": "Edit profile, avatar upload, role display.", "priority": "medium", "type": "feature"},
        {"title": "Notification system", "description": "In-app toast notifications.", "priority": "medium", "type": "feature"},
        {"title": "Database schema & migrations", "description": "Users, projects, tasks tables with Alembic.", "priority": "high", "type": "infra"},
        {"title": "API rate limiting & security middleware", "description": "Add slowapi rate limits and CORS headers.", "priority": "low", "type": "infra"},
    ]
