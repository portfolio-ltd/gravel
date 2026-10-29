"""Task execution: opencode or Claude Code CLI (agentic, edits the repo) or a direct LLM call.

All paths end in the same result dict (see .gravel/OUTPUT_CONTRACT.md):
outcome_type, summary, blocking_reason, plus optional structured stage
results — documents, acceptance criteria, questions, knowledge, verdict.
"""
import json
import os
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
.gravel/QUESTIONS.md and .gravel/KNOWLEDGE.md, plus .gravel/CODE_MAP.md (a map of the repository) and
.gravel/SUBAGENTS.md (subagents you can delegate to) when present, and any earlier stage documents
under .gravel/docs/. Then do the work STAGE_INSTRUCTIONS.md describes. Never invent requirements: anything you cannot
decide from this material is an open question with an owner.

Report your result exactly as .gravel/OUTPUT_CONTRACT.md describes: write .gravel/output/result.json
and end your final message with the same JSON object. Never commit files under .gravel/.
"""

_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)

PROVIDER_KEY_ENV = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY"}


def select_model(payload: dict) -> tuple[str, str, str | None]:
    """(provider, model, note) for a claimed run.

    Gravel resolves the run's model (stage → engineer → project → default)
    and sends it with the poll. A runtime only holds the API key for its
    engineer's provider, so a model from another provider falls back to the
    launch model and the note explains why.
    """
    model = payload.get("model") or config.model_name
    provider = payload.get("model_provider") or config.model_provider
    if provider != config.model_provider and not os.environ.get(PROVIDER_KEY_ENV.get(provider, "")):
        return config.model_provider, config.model_name, (
            f"No {provider} API key in this runtime — using {config.model_name} instead of {model}."
        )
    return provider, model, None


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


def run_opencode(workspace: Path, provider: str, model: str) -> dict:
    if config.dry_run:
        return {"outcome_type": "needs_human_input", "summary": "Dry run — no work executed.",
                "blocking_reason": "Runtime launched with GRAVEL_DRY_RUN=true"}
    cmd = [
        config.opencode_command, "run",
        "--model", f"{provider}/{model}",
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


def claude_graph_args(workspace: Path) -> list[str]:
    """Subagents (--agents) and the test-gate Stop hook (--settings) from the bundle."""
    base = workspace / ".gravel" / "claude"
    args: list[str] = []
    agents = base / "agents.json"
    if config.claude_subagents and agents.exists():
        args += ["--agents", agents.read_text()]
    settings = base / "settings.json"
    if config.claude_test_gate and settings.exists():
        args += ["--settings", str(settings)]
    return args


def run_claude_code(workspace: Path, provider: str, model: str) -> dict:
    if config.dry_run:
        return {"outcome_type": "needs_human_input", "summary": "Dry run — no work executed.",
                "blocking_reason": "Runtime launched with GRAVEL_DRY_RUN=true"}
    if provider != "anthropic":
        return _failed(f"Claude Code needs an Anthropic model, not provider '{provider}'.")
    cmd = [
        config.claude_command, "-p", SYSTEM_INSTRUCTIONS,
        "--output-format", "json",
        "--model", model,
        "--dangerously-skip-permissions",
    ]
    if config.claude_max_turns > 0:
        cmd += ["--max-turns", str(config.claude_max_turns)]
    cmd += claude_graph_args(workspace)
    # The container runs as root, where Claude Code only skips permission
    # prompts once told it is inside a sandbox
    env = {**os.environ, "IS_SANDBOX": "1"}
    try:
        result = subprocess.run(cmd, cwd=str(workspace), capture_output=True, text=True, timeout=3600, env=env)
    except subprocess.TimeoutExpired:
        return _failed("Claude Code timed out after 60 minutes.")
    except FileNotFoundError:
        return _failed(f"Claude Code binary '{config.claude_command}' not found in runtime image.")
    # --output-format json wraps the final message in a result envelope with usage
    try:
        envelope = json.loads(result.stdout)
    except json.JSONDecodeError:
        envelope = None
    if not isinstance(envelope, dict):
        envelope = {"result": result.stdout}
    text = envelope.get("result") or ""
    if result.returncode != 0 or envelope.get("is_error"):
        return _failed(f"Claude Code exited {result.returncode}", result.stderr or text or result.stdout or "")
    parsed = _parse(text)
    if parsed is None and not (workspace / ".gravel" / "output" / "result.json").exists():
        return _failed("Executor produced no parseable result.", text or "no output")
    outcome = collect_outputs(workspace, parsed or {"outcome_type": "failed", "summary": ""})
    usage = envelope.get("usage") or {}
    tokens_in = sum(usage.get(key) or 0 for key in
                    ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    outcome.setdefault("tokens_in", tokens_in)
    outcome.setdefault("tokens_out", usage.get("output_tokens") or 0)
    return outcome


def _bundle_text(workspace: Path) -> str:
    base = workspace / ".gravel"
    parts = []
    for path in sorted(base.rglob("*")):
        if path.is_file() and "output" not in path.relative_to(base).parts:
            parts.append(f"---- .gravel/{path.relative_to(base)} ----\n{path.read_text()}")
    return "\n\n".join(parts)


def run_llm(workspace: Path, provider: str, model: str) -> dict:
    """Single-shot LLM execution: reasons over the bundle, cannot edit the repo."""
    prompt = (SYSTEM_INSTRUCTIONS + "\nYou cannot edit files in this mode; reply with the JSON object only.\n\n"
              + _bundle_text(workspace))
    try:
        if provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic()
            msg = client.messages.create(
                model=model, max_tokens=16000,
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
            from openai import OpenAI
            base_url = "https://api.groq.com/openai/v1" if provider == "groq" else None
            api_key = os.environ.get("GROQ_API_KEY") if provider == "groq" else os.environ.get("OPENAI_API_KEY")
            resp = OpenAI(base_url=base_url, api_key=api_key).chat.completions.create(
                model=model, messages=[{"role": "user", "content": prompt}], max_tokens=16000,
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


def execute(workspace: Path, provider: str | None = None, model: str | None = None) -> dict:
    provider, model = provider or config.model_provider, model or config.model_name
    if config.executor == "llm":
        return run_llm(workspace, provider, model)
    if config.executor == "claude-code":
        return run_claude_code(workspace, provider, model)
    return run_opencode(workspace, provider, model)
