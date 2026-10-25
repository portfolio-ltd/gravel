"""Runtime workspace + executor behaviour against real (local) git repos."""
import json
import os
import subprocess
from pathlib import Path

import pytest

from gravel_runtime import executor, workspace
from gravel_runtime.config import config

GIT_ENV = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}


def git(*args: str, cwd: Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True, env=GIT_ENV).stdout


@pytest.fixture
def remote(tmp_path: Path) -> Path:
    """A bare 'origin' with main and a task branch that has one extra commit."""
    origin = tmp_path / "origin.git"
    git("init", "--bare", "-b", "main", str(origin), cwd=tmp_path)
    seed = tmp_path / "seed"
    git("clone", str(origin), str(seed), cwd=tmp_path)
    (seed / "app.py").write_text("print('v1')\n")
    git("add", "-A", cwd=seed)
    git("commit", "-m", "init", cwd=seed)
    git("push", "origin", "HEAD:main", cwd=seed)
    git("checkout", "-b", "gravel/task-1", cwd=seed)
    (seed / "feature.py").write_text("built = True\n")
    git("add", "-A", cwd=seed)
    git("commit", "-m", "build", cwd=seed)
    git("push", "origin", "gravel/task-1", cwd=seed)
    return origin


@pytest.fixture(autouse=True)
def _workspace_dir(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(config, "workspace_dir", str(tmp_path / "ws"))
    monkeypatch.setattr(config, "github_token", "")


def test_later_stages_continue_from_the_remote_task_branch(remote: Path):
    root = workspace.prepare_workspace("abcdef12", str(remote), "main")
    workspace.checkout_branch(root, "gravel/task-1", create=True)
    assert (root / "feature.py").exists(), "review/verify must see what the build pushed"


def test_new_branch_is_cut_from_default(remote: Path):
    root = workspace.prepare_workspace("abcdef12", str(remote), "main")
    workspace.checkout_branch(root, "gravel/task-2", create=True)
    assert git("rev-parse", "--abbrev-ref", "HEAD", cwd=root).strip() == "gravel/task-2"
    assert not (root / "feature.py").exists()


def test_bundle_is_never_committed(remote: Path):
    root = workspace.prepare_workspace("abcdef12", str(remote), "main")
    workspace.checkout_branch(root, "gravel/task-1", create=True)
    base = workspace.write_bundle(root, {"TASK.md": "# Task", "docs/PLAN.md": "plan", "../escape.md": "x"})
    assert (base / "docs" / "PLAN.md").read_text() == "plan"
    assert not (root / "escape.md").exists() and not (root.parent / "escape.md").exists()
    (root / "feature.py").write_text("built = 2\n")
    assert workspace.commit_and_push(root, "gravel/task-1", "rework") is True
    files = git("ls-tree", "-r", "--name-only", "origin/gravel/task-1", cwd=root).split()
    assert "feature.py" in files and not any(f.startswith(".gravel") for f in files)


def test_collect_outputs_merges_files_over_inline(tmp_path: Path):
    out = tmp_path / ".gravel" / "output"
    out.mkdir(parents=True)
    (out / "result.json").write_text(json.dumps({"outcome": "completed", "summary": "Planned", "verdict": "none",
                                                 "open_questions": [{"question": "Q?", "owner": "PM"}]}))
    (out / "plan.md").write_text("# Plan")
    (out / "scenarios.feature").write_text("Feature: x")
    (out / "random.md").write_text("ignored")
    result = executor.collect_outputs(tmp_path, {"outcome_type": "completed", "summary": "",
                                                 "documents": [{"kind": "plan", "title": "Old", "body": "old"}]})
    assert result["summary"] == "Planned" and result["open_questions"][0]["owner"] == "PM"
    assert {d["kind"]: d["body"] for d in result["documents"]} == {"plan": "# Plan", "scenarios": "Feature: x"}


def test_parse_accepts_current_and_legacy_keys():
    assert executor._parse('done. {"outcome": "blocked", "summary": "s"}')["outcome_type"] == "blocked"
    assert executor._parse('{"outcome_type": "completed", "summary": "s"}')["outcome_type"] == "completed"
    assert executor._parse('{"outcome": "bogus"}') is None
    assert executor._parse("no json") is None


def _claude_envelope(result: str, *, is_error: bool = False) -> str:
    return json.dumps({"type": "result", "subtype": "success", "is_error": is_error, "result": result,
                       "usage": {"input_tokens": 10, "cache_creation_input_tokens": 100,
                                 "cache_read_input_tokens": 1000, "output_tokens": 50}})


@pytest.fixture
def claude_code(monkeypatch):
    """Select the Claude Code executor and capture the subprocess call."""
    monkeypatch.setattr(config, "executor", "claude-code")
    monkeypatch.setattr(config, "model_provider", "anthropic")
    monkeypatch.setattr(config, "model_name", "claude-opus-5-5")
    monkeypatch.setattr(config, "claude_max_turns", 0)
    monkeypatch.setattr(config, "dry_run", False)
    calls = {"stdout": "", "returncode": 0}

    def fake_run(cmd, **kwargs):
        calls.update(cmd=cmd, kwargs=kwargs)
        if calls.get("side_effect"):
            raise calls["side_effect"]
        return subprocess.CompletedProcess(cmd, calls["returncode"], calls["stdout"], "boom")

    monkeypatch.setattr(executor.subprocess, "run", fake_run)
    return calls


def test_execute_selects_executor(monkeypatch, tmp_path: Path):
    for name in ("run_opencode", "run_claude_code", "run_llm"):
        monkeypatch.setattr(executor, name, lambda _ws, _provider, _model, name=name: {"ran": name})
    for selected, expected in (("opencode", "run_opencode"), ("claude-code", "run_claude_code"), ("llm", "run_llm")):
        monkeypatch.setattr(config, "executor", selected)
        assert executor.execute(tmp_path) == {"ran": expected}


def test_claude_code_command(claude_code, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config, "claude_max_turns", 40)
    claude_code["stdout"] = _claude_envelope('{"outcome": "completed", "summary": "s"}')
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    cmd = claude_code["cmd"]
    assert cmd[:3] == ["claude", "-p", executor.SYSTEM_INSTRUCTIONS]
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert cmd[cmd.index("--model") + 1] == "claude-opus-5-5"
    assert "--dangerously-skip-permissions" in cmd and cmd[cmd.index("--max-turns") + 1] == "40"
    assert claude_code["kwargs"]["cwd"] == str(tmp_path) and claude_code["kwargs"]["env"]["IS_SANDBOX"] == "1"


def test_claude_code_result_matches_contract(claude_code, tmp_path: Path):
    out = tmp_path / ".gravel" / "output"
    out.mkdir(parents=True)
    (out / "plan.md").write_text("# Plan")
    claude_code["stdout"] = _claude_envelope(
        'Done.\n{"outcome": "completed", "summary": "Planned", "acceptance_criteria": ["works"]}')
    result = executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert "--max-turns" not in claude_code["cmd"]
    assert result["outcome_type"] == "completed" and result["summary"] == "Planned"
    assert result["acceptance_criteria"] == ["works"]
    assert result["documents"] == [{"kind": "plan", "title": "Plan", "body": "# Plan"}]
    assert (result["tokens_in"], result["tokens_out"]) == (1110, 50)


def test_claude_code_result_file_without_final_json(claude_code, tmp_path: Path):
    out = tmp_path / ".gravel" / "output"
    out.mkdir(parents=True)
    (out / "result.json").write_text(json.dumps({"outcome": "blocked", "summary": "s", "blocking_reason": "r"}))
    claude_code["stdout"] = _claude_envelope("I wrote the result file.")
    result = executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert result["outcome_type"] == "blocked" and result["blocking_reason"] == "r"


def test_claude_code_failures(claude_code, tmp_path: Path):
    claude_code["stdout"] = _claude_envelope("no json here")
    assert executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")["summary"] == "Executor produced no parseable result."

    claude_code["stdout"] = _claude_envelope("API error", is_error=True)
    claude_code["returncode"] = 1
    result = executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert result["outcome_type"] == "failed" and result["summary"] == "Claude Code exited 1"

    claude_code["side_effect"] = FileNotFoundError()
    result = executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert result["outcome_type"] == "failed" and "not found in runtime image" in result["summary"]

    claude_code["side_effect"] = subprocess.TimeoutExpired("claude", 3600)
    assert executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")["summary"] == "Claude Code timed out after 60 minutes."

    claude_code.pop("cmd")
    assert executor.run_claude_code(tmp_path, "openai", "gpt-5")["outcome_type"] == "failed" and "cmd" not in claude_code


def test_claude_code_uses_the_run_model(claude_code, tmp_path: Path):
    claude_code["stdout"] = _claude_envelope('{"outcome": "completed", "summary": "s"}')
    executor.run_claude_code(tmp_path, "anthropic", "claude-haiku-5-5")
    assert claude_code["cmd"][claude_code["cmd"].index("--model") + 1] == "claude-haiku-5-5"


def test_select_model_uses_the_resolved_run_model(monkeypatch):
    monkeypatch.setattr(config, "model_provider", "anthropic")
    monkeypatch.setattr(config, "model_name", "claude-opus-5-5")
    assert executor.select_model({"model": "claude-haiku-5-5", "model_provider": "anthropic"}) == \
        ("anthropic", "claude-haiku-5-5", None)
    # Older servers send no model: keep the launch model
    assert executor.select_model({}) == ("anthropic", "claude-opus-5-5", None)


def test_select_model_falls_back_without_the_provider_key(monkeypatch):
    monkeypatch.setattr(config, "model_provider", "anthropic")
    monkeypatch.setattr(config, "model_name", "claude-opus-5-5")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    provider, model, note = executor.select_model({"model": "gpt-5", "model_provider": "openai"})
    assert (provider, model) == ("anthropic", "claude-opus-5-5") and "gpt-5" in note
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert executor.select_model({"model": "gpt-5", "model_provider": "openai"}) == ("openai", "gpt-5", None)
