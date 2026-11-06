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


def test_claude_code_passes_bundle_subagents_and_test_gate(claude_code, monkeypatch, tmp_path: Path):
    claude_code["stdout"] = _claude_envelope('{"outcome": "completed", "summary": "s"}')
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert "--agents" not in claude_code["cmd"] and "--settings" not in claude_code["cmd"]

    claude_dir = tmp_path / ".gravel" / "claude"
    claude_dir.mkdir(parents=True)
    (claude_dir / "agents.json").write_text('{"reviewer": {"description": "d", "prompt": "p"}}')
    (claude_dir / "settings.json").write_text('{"hooks": {}}')
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    cmd = claude_code["cmd"]
    assert cmd[cmd.index("--agents") + 1] == '{"reviewer": {"description": "d", "prompt": "p"}}'
    assert cmd[cmd.index("--settings") + 1] == str(claude_dir / "settings.json")

    monkeypatch.setattr(config, "claude_subagents", False)
    monkeypatch.setattr(config, "claude_test_gate", False)
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert "--agents" not in claude_code["cmd"] and "--settings" not in claude_code["cmd"]


def test_claude_code_applies_the_harness_limits(claude_code, monkeypatch, tmp_path: Path):
    claude_code["stdout"] = _claude_envelope('{"outcome": "completed", "summary": "s"}')
    bundle = tmp_path / ".gravel"
    bundle.mkdir(parents=True)
    (bundle / "harness.json").write_text(json.dumps({
        "name": "Read-only analysis", "max_turns": 60,
        "allowed_tools": [], "disallowed_tools": ["Edit", "Write"],
    }))
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    cmd = claude_code["cmd"]
    assert cmd[cmd.index("--max-turns") + 1] == "60"
    assert cmd[cmd.index("--disallowedTools") + 1] == "Edit,Write" and "--allowedTools" not in cmd
    assert cmd.count("--max-turns") == 1

    # The runtime's own, lower limit is the ceiling
    monkeypatch.setattr(config, "claude_max_turns", 20)
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    cmd = claude_code["cmd"]
    assert cmd[cmd.index("--max-turns") + 1] == "20" and cmd.count("--max-turns") == 1

    # A broken harness file is ignored, not fatal
    (bundle / "harness.json").write_text("{not json")
    monkeypatch.setattr(config, "claude_max_turns", 0)
    executor.run_claude_code(tmp_path, "anthropic", "claude-opus-5-5")
    assert "--max-turns" not in claude_code["cmd"] and executor.read_harness(tmp_path) == {}


# ── Codex executor, local-runner git, keyless jobs, CLI ──────────────────────

def test_codex_command_and_result(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config, "dry_run", False)
    monkeypatch.setattr(config, "codex_args", "--config model_reasoning_effort=high")
    calls = {}

    def fake_run(cmd, **kwargs):
        calls.update(cmd=cmd, kwargs=kwargs)
        Path(cmd[cmd.index("--output-last-message") + 1]).write_text('Done.\n{"outcome": "completed", "summary": "s"}')
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(executor.subprocess, "run", fake_run)
    result = executor.run_codex(tmp_path, "openai", "gpt-5.5")
    cmd = calls["cmd"]
    assert cmd[:3] == ["codex", "exec", "--skip-git-repo-check"] and cmd[-1] == executor.SYSTEM_INSTRUCTIONS
    assert cmd[cmd.index("--model") + 1] == "gpt-5.5" and "model_reasoning_effort=high" in cmd
    assert result["outcome_type"] == "completed" and calls["kwargs"]["cwd"] == str(tmp_path)

    executor.run_codex(tmp_path, "anthropic", "claude-opus-5-5")
    assert "--model" not in calls["cmd"]  # not an OpenAI model → Codex's own default


def test_select_model_explains_fallback_to_executor_default(monkeypatch):
    monkeypatch.setattr(config, "model_provider", "openai")
    monkeypatch.setattr(config, "model_name", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    provider, model, note = executor.select_model({"model": "claude-opus-5-5", "model_provider": "anthropic"})
    assert (provider, model) == ("openai", "") and "default model" in note


def test_ssh_clone_url_for_local_runners(monkeypatch):
    monkeypatch.setattr(config, "github_token", "")
    monkeypatch.setattr(config, "git_ssh", True)
    assert workspace._authed_url("https://github.com/acme/shop.git") == "git@github.com:acme/shop.git"
    monkeypatch.setattr(config, "github_token", "t0ken")
    assert workspace._authed_url("https://github.com/acme/shop").startswith("https://x-access-token:t0ken@")


def test_pull_request_through_gh_without_a_token(monkeypatch):
    from gravel_runtime import github
    monkeypatch.setattr(config, "github_token", "")
    monkeypatch.setattr(github.shutil, "which", lambda name: "/usr/bin/gh")
    seen = []

    def fake_run(cmd, **kwargs):
        seen.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, "https://github.com/acme/shop/pull/7\n", "")

    monkeypatch.setattr(github.subprocess, "run", fake_run)
    url = github.create_or_get_pull_request("https://github.com/acme/shop", "gravel/task-1", "main", "T", "B")
    assert url == "https://github.com/acme/shop/pull/7" and seen[0][:5] == ["gh", "pr", "create", "--repo", "acme/shop"]


def test_jobs_answer_with_claude_and_codex(monkeypatch):
    from gravel_runtime import jobs
    job = {"id": "j1", "model": "claude-opus-5-5", "system": "Be brief.", "prompt": "Split this PRD",
           "json_schema": {"type": "object"}, "max_tokens": 100}
    seen = {}

    def fake_claude(cmd, **kwargs):
        seen["claude"] = cmd
        return subprocess.CompletedProcess(cmd, 0, json.dumps(
            {"result": '{"tasks": []}', "usage": {"input_tokens": 5, "output_tokens": 2}}), "")

    monkeypatch.setattr(config, "executor", "claude-code")
    monkeypatch.setattr(jobs.subprocess, "run", fake_claude)
    assert jobs.run_job(job) == {"text": '{"tasks": []}', "tokens_in": 5, "tokens_out": 2}
    prompt = seen["claude"][2]
    assert prompt.startswith("Be brief.") and "Split this PRD" in prompt and '"type": "object"' in prompt
    assert seen["claude"][seen["claude"].index("--max-turns") + 1] == "1"

    def fake_codex(cmd, **kwargs):
        Path(cmd[cmd.index("--output-last-message") + 1]).write_text("an answer")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(config, "executor", "codex")
    monkeypatch.setattr(jobs.subprocess, "run", fake_codex)
    assert jobs.run_job(job) == {"text": "an answer"}
    monkeypatch.setattr(config, "executor", "opencode")
    assert "can't answer" in jobs.run_job(job)["error"]


def test_cli_device_login_saves_private_credentials(monkeypatch, tmp_path: Path):
    import httpx

    from gravel_runtime import cli
    monkeypatch.setenv("GRAVEL_CONFIG_DIR", str(tmp_path / "cfg"))
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    polls = iter([{"status": "pending"}, {"status": "approved", "access_token": "grv_abc"}])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/auth/device/start":
            return httpx.Response(200, json={"device_code": "dc", "user_code": "BCDF-GHJK",
                                             "verification_uri": "https://g.test/cli",
                                             "verification_uri_complete": "https://g.test/cli?code=BCDF-GHJK",
                                             "interval": 1, "expires_in": 600})
        if request.url.path == "/api/auth/device/token":
            return httpx.Response(200, json=next(polls))
        assert request.headers["Authorization"] == "Bearer grv_abc"
        return httpx.Response(200, json={"name": "Ada", "email": "ada@example.com"})

    args = cli.build_parser().parse_args(["login", "--server", "https://api.g.test", "--no-browser"])
    assert cli.cmd_login(args, transport=httpx.MockTransport(handler)) == 0
    path = tmp_path / "cfg" / "credentials.json"
    assert json.loads(path.read_text()) == {"server": "https://api.g.test", "token": "grv_abc", "org_id": None}
    assert oct(path.stat().st_mode & 0o777) == "0o600"


def test_cli_tasks_show_what_they_wait_on(monkeypatch, tmp_path: Path, capsys):
    import httpx

    from gravel_runtime import cli
    monkeypatch.setenv("GRAVEL_CONFIG_DIR", str(tmp_path))
    cli.save_credentials({"server": "https://api.g.test", "token": "grv_abc"})
    project = {"tasks": [
        {"id": "a", "title": "Schema", "status": "in_progress", "position": 0, "depends_on": []},
        {"id": "b", "title": "API", "status": "pending", "position": 1, "depends_on": ["a"]},
    ]}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=project))
    cli.cmd_tasks(cli.build_parser().parse_args(["tasks", "p1"]), transport=transport)
    out = capsys.readouterr().out
    assert "API  (waiting on 1)" in out and "Schema\n" in out
