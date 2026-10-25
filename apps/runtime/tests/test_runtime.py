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
