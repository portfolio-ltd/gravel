"""Model calls a local runner answers for its owner (keyless projects).

Gravel's server sometimes needs a plain completion — a stage run in-process,
PRD parsing or chat, a code-graph summary. When its user has no API key but
runs `gravel work`, the server queues the call as a job; this module answers
it with the AI CLI the person is signed in to, in an empty directory, with no
repository access.
"""
import json
import subprocess
import tempfile
from pathlib import Path

from .config import config


def _prompt(job: dict) -> str:
    parts = []
    if job.get("system"):
        parts.append(job["system"])
    parts.append(job["prompt"])
    if job.get("json_schema"):
        parts.append("Reply with a single JSON object, and nothing else, matching this JSON schema:\n"
                     + json.dumps(job["json_schema"]))
    parts.append("Answer from the text above only. Do not use tools or read files.")
    return "\n\n".join(parts)


def run_job(job: dict) -> dict:
    """{text, error, tokens_in, tokens_out} for a job from /api/agent/poll-next-job."""
    model = job.get("model") or ""
    with tempfile.TemporaryDirectory(prefix="gravel-job-") as tmp:
        try:
            if config.executor == "claude-code":
                return _claude(job, model, tmp)
            if config.executor == "codex":
                return _codex(job, model, tmp)
        except subprocess.TimeoutExpired:
            return {"error": "The model call timed out on the runner"}
        except FileNotFoundError as exc:
            return {"error": f"Executor not found on the runner: {exc.filename}"}
    return {"error": f"Executor '{config.executor}' can't answer model calls; run `gravel work` with "
                     "--executor claude-code or codex"}


def _claude(job: dict, model: str, cwd: str) -> dict:
    cmd = [config.claude_command, "-p", _prompt(job), "--output-format", "json", "--max-turns", "1"]
    if model.startswith("claude"):
        cmd += ["--model", model]
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    try:
        envelope = json.loads(result.stdout)
    except json.JSONDecodeError:
        envelope = {"result": result.stdout}
    text = (envelope.get("result") or "").strip() if isinstance(envelope, dict) else ""
    if result.returncode != 0 or envelope.get("is_error") or not text:
        return {"error": f"Claude Code exited {result.returncode}: {(result.stderr or text or result.stdout)[-500:]}"}
    usage = envelope.get("usage") or {}
    return {"text": text,
            "tokens_in": sum(usage.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens",
                                                         "cache_read_input_tokens")),
            "tokens_out": usage.get("output_tokens") or 0}


def _codex(job: dict, model: str, cwd: str) -> dict:
    out = Path(cwd) / "answer.txt"
    cmd = [config.codex_command, "exec", "--skip-git-repo-check", "--sandbox", "read-only",
           "--output-last-message", str(out)]
    if model.startswith(("gpt", "o1", "o3", "o4", "codex")):
        cmd += ["--model", model]
    cmd.append(_prompt(job))
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    text = out.read_text().strip() if out.exists() else ""
    if result.returncode != 0 or not text:
        return {"error": f"Codex exited {result.returncode}: {(result.stderr or result.stdout)[-500:]}"}
    return {"text": text}
