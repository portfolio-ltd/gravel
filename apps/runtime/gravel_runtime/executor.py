"""Task execution: opencode CLI (agentic, edits the repo) or a direct LLM call.

Both paths end in the same result dict (see .gravel/OUTPUT_CONTRACT.md):
outcome_type, summary, blocking_reason, plus optional structured stage
results — documents, acceptance criteria, questions, knowledge, verdict.
"""
import json
import re
import subprocess
from pathlib import Path

from .config import config

ALLOWED_OUTCOMES = {"completed", "needs_human_input", "blocked", "failed"}
STRUCTURED_FIELDS = ("verdict", "documents", "acceptance_criteria", "open_questions",
                     "resolved_questions", "knowledge")
DOC_KINDS = {"analysis", "spec", "plan", "scenarios", "review", "verification", "notes"}

SYSTEM_INSTRUCTIONS = """You are an autonomous software engineer working on the task described in .gravel/.

Read .gravel/TASK.md, .gravel/STAGE_INSTRUCTIONS.md, .gravel/COMMENTS.md, .gravel/PROJECT_CONTEXT.md,
.gravel/QUESTIONS.md and .gravel/KNOWLEDGE.md, plus any earlier stage documents under .gravel/docs/.
Then do the work STAGE_INSTRUCTIONS.md describes. Never invent requirements: anything you cannot
decide from this material is an open question with an owner.

Report your result exactly as .gravel/OUTPUT_CONTRACT.md describes: write .gravel/output/result.json
and end your final message with the same JSON object. Never commit files under .gravel/.
"""

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse(text: str) -> dict | None:
    match = _JSON_RE.search(text or "")
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    # Accept both the current contract ("outcome") and the legacy key
    outcome = data.get("outcome_type") or data.get("outcome")
    if outcome not in ALLOWED_OUTCOMES:
        return None
    data["outcome_type"] = outcome
    return data


def _failed(summary: str, detail: str = "") -> dict:
    return {"outcome_type": "failed", "summary": summary, "blocking_reason": detail[-1000:]}


def collect_outputs(workspace: Path, result: dict) -> dict:
    """Merge .gravel/output/ files into the result (files win over inline JSON)."""
    out_dir = workspace / ".gravel" / "output"
    if not out_dir.is_dir():
        return result
    file_result = _parse((out_dir / "result.json").read_text()) if (out_dir / "result.json").exists() else None
    if file_result:
        result = {**result, **file_result}
    documents = [d for d in result.get("documents") or [] if isinstance(d, dict)]
    for path in sorted(out_dir.iterdir()):
        kind = path.stem.lower()
        if path.suffix in (".md", ".feature") and kind in DOC_KINDS:
            documents = [d for d in documents if d.get("kind") != kind]
            documents.append({"kind": kind, "title": kind.title(), "body": path.read_text()})
    if documents:
        result["documents"] = documents
    return result


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
        result = subprocess.run(cmd, cwd=str(workspace), capture_output=True, text=True, timeout=3600)
    except subprocess.TimeoutExpired:
        return _failed("opencode timed out after 60 minutes.")
    except FileNotFoundError:
        return _failed(f"opencode binary '{config.opencode_command}' not found in runtime image.")
    if result.returncode != 0:
        return _failed(f"opencode exited {result.returncode}", result.stderr or result.stdout or "")
    parsed = _parse(result.stdout)
    if parsed is None and not (workspace / ".gravel" / "output" / "result.json").exists():
        return _failed("Executor produced no parseable result.", result.stdout or "no output")
    return collect_outputs(workspace, parsed or {"outcome_type": "failed", "summary": ""})


def _bundle_text(workspace: Path) -> str:
    base = workspace / ".gravel"
    parts = []
    for path in sorted(base.rglob("*")):
        if path.is_file() and "output" not in path.relative_to(base).parts:
            parts.append(f"---- .gravel/{path.relative_to(base)} ----\n{path.read_text()}")
    return "\n\n".join(parts)


def run_llm(workspace: Path) -> dict:
    """Single-shot LLM execution: reasons over the bundle, cannot edit the repo."""
    prompt = (SYSTEM_INSTRUCTIONS + "\nYou cannot edit files in this mode; reply with the JSON object only.\n\n"
              + _bundle_text(workspace))
    try:
        if config.model_provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic()
            msg = client.messages.create(
                model=config.model_name, max_tokens=16000,
                messages=[{"role": "user", "content": prompt}],
            )
            if msg.stop_reason == "refusal":
                return {"outcome_type": "needs_human_input", "summary": "The model declined this request.",
                        "blocking_reason": "Model refusal — review the task and retry with adjusted instructions."}
            # Content may open with thinking blocks — only text blocks carry the answer
            text = "".join(b.text for b in msg.content if b.type == "text")
            usage = getattr(msg, "usage", None)
            tokens = (getattr(usage, "input_tokens", 0) or 0, getattr(usage, "output_tokens", 0) or 0)
        else:
            import os

            from openai import OpenAI
            base_url = "https://api.groq.com/openai/v1" if config.model_provider == "groq" else None
            api_key = os.environ.get("GROQ_API_KEY") if config.model_provider == "groq" else os.environ.get("OPENAI_API_KEY")
            resp = OpenAI(base_url=base_url, api_key=api_key).chat.completions.create(
                model=config.model_name, messages=[{"role": "user", "content": prompt}], max_tokens=16000,
            )
            text = resp.choices[0].message.content or ""
            usage = getattr(resp, "usage", None)
            tokens = (getattr(usage, "prompt_tokens", 0) or 0, getattr(usage, "completion_tokens", 0) or 0)
    except Exception as exc:
        return _failed(f"LLM call failed: {exc}")
    outcome = _parse(text) or _failed("Executor produced no parseable result.", text)
    outcome.setdefault("tokens_in", tokens[0])
    outcome.setdefault("tokens_out", tokens[1])
    return outcome


def execute(workspace: Path) -> dict:
    if config.executor == "llm":
        return run_llm(workspace)
    return run_opencode(workspace)
