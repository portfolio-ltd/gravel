"""Task execution: opencode CLI (agentic, edits the repo) or a direct LLM call."""
import json
import re
import subprocess
from pathlib import Path

from .config import config

ALLOWED_OUTCOMES = {"completed", "needs_human_input", "blocked", "failed"}

SYSTEM_INSTRUCTIONS = """You are an autonomous software engineer working on the task described in this workspace.

Read TASK.md, COMMENTS.md, PROJECT_CONTEXT.md and STAGE_INSTRUCTIONS.md, then do the work STAGE_INSTRUCTIONS.md describes.

When you are done, output exactly one JSON object (and nothing after it) shaped like:
{"outcome_type": "completed" | "needs_human_input" | "blocked" | "failed",
 "summary": "what you did and how you verified it",
 "blocking_reason": "only when blocked or needing input",
 "deploy_url": "only when you deployed something",
 "tokens_in": 0, "tokens_out": 0}
(tokens_in/tokens_out are optional — include them only if you know your usage)
"""

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_outcome(stdout: str) -> dict:
    match = _JSON_RE.search(stdout or "")
    if match:
        try:
            data = json.loads(match.group(0))
            if data.get("outcome_type") in ALLOWED_OUTCOMES:
                return data
        except json.JSONDecodeError:
            pass
    return {
        "outcome_type": "failed",
        "summary": "Executor produced no parseable outcome JSON.",
        "blocking_reason": (stdout or "no output")[-1000:],
    }


def run_opencode(workspace: Path) -> dict:
    if config.dry_run:
        return {"outcome_type": "needs_human_input", "summary": "Dry run — no work executed.",
                "blocking_reason": "Runtime launched with GRAVEL_DRY_RUN=true"}
    cmd = [
        config.opencode_command, "run",
        "--model", f"{config.model_provider}/{config.model_name}",
        "--dangerously-skip-permissions",
        SYSTEM_INSTRUCTIONS,
    ]
    try:
        result = subprocess.run(
            cmd, cwd=str(workspace), capture_output=True, text=True, timeout=3600,
        )
    except subprocess.TimeoutExpired:
        return {"outcome_type": "failed", "summary": "opencode timed out after 60 minutes."}
    except FileNotFoundError:
        return {"outcome_type": "failed",
                "summary": f"opencode binary '{config.opencode_command}' not found in runtime image."}
    if result.returncode != 0:
        return {"outcome_type": "failed",
                "summary": f"opencode exited {result.returncode}",
                "blocking_reason": (result.stderr or result.stdout or "")[-1000:]}
    return _extract_outcome(result.stdout)


def run_llm(workspace: Path) -> dict:
    """Single-shot LLM execution: reasons over the bundle, cannot edit the repo."""
    bundle_text = ""
    for name in ("TASK.md", "COMMENTS.md", "PROJECT_CONTEXT.md", "STAGE_INSTRUCTIONS.md"):
        path = workspace / name
        if path.exists():
            bundle_text += f"\n\n---- {name} ----\n{path.read_text()}"

    prompt = SYSTEM_INSTRUCTIONS + bundle_text
    try:
        if config.model_provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic()
            msg = client.messages.create(
                model=config.model_name, max_tokens=1000,
                messages=[{"role": "user", "content": prompt}],
            )
            outcome = _extract_outcome(msg.content[0].text)
            usage = getattr(msg, "usage", None)
            outcome.setdefault("tokens_in", getattr(usage, "input_tokens", 0) or 0)
            outcome.setdefault("tokens_out", getattr(usage, "output_tokens", 0) or 0)
            return outcome
        import os
        from openai import OpenAI
        base_url = "https://api.groq.com/openai/v1" if config.model_provider == "groq" else None
        api_key = os.environ.get("GROQ_API_KEY") if config.model_provider == "groq" else os.environ.get("OPENAI_API_KEY")
        client = OpenAI(base_url=base_url, api_key=api_key)
        resp = client.chat.completions.create(
            model=config.model_name,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
        )
        outcome = _extract_outcome(resp.choices[0].message.content or "")
        usage = getattr(resp, "usage", None)
        outcome.setdefault("tokens_in", getattr(usage, "prompt_tokens", 0) or 0)
        outcome.setdefault("tokens_out", getattr(usage, "completion_tokens", 0) or 0)
        return outcome
    except Exception as exc:
        return {"outcome_type": "failed", "summary": f"LLM call failed: {exc}"}


def execute(workspace: Path) -> dict:
    if config.executor == "llm":
        return run_llm(workspace)
    return run_opencode(workspace)
