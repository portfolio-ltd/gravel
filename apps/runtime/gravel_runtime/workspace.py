"""Git workspace preparation for a task run."""
import shutil
import subprocess
import time
from pathlib import Path

from .config import config

TRANSIENT_ERRORS = ("could not resolve host", "connection reset", "timed out", "early eof")


def _run_git(args: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=600,
    )


def _authed_url(repo_url: str) -> str:
    if config.github_token and repo_url.startswith("https://github.com/"):
        return repo_url.replace(
            "https://github.com/",
            f"https://x-access-token:{config.github_token}@github.com/",
        )
    return repo_url


def prepare_workspace(task_id: str, repo_url: str | None, branch: str) -> Path:
    """Fresh clone (or bare dir when the project has no repo)."""
    root = Path(config.workspace_dir) / f"task-{task_id[:8]}"
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)

    if not repo_url:
        return root

    url = _authed_url(repo_url)
    last_error = ""
    for attempt in range(3):
        result = _run_git(["clone", "--depth", "50", "--branch", branch, url, str(root)])
        if result.returncode == 0:
            return root
        last_error = result.stderr.strip()
        # A missing branch is fine — fall back to the default clone
        if "not found in upstream" in last_error or "Remote branch" in last_error:
            result = _run_git(["clone", "--depth", "50", url, str(root)])
            if result.returncode == 0:
                return root
            last_error = result.stderr.strip()
        if not any(marker in last_error.lower() for marker in TRANSIENT_ERRORS):
            break
        time.sleep(2 ** attempt)
    raise RuntimeError(f"git clone failed: {last_error}")


def checkout_branch(root: Path, branch: str, create: bool) -> str:
    """Check out the task branch, continuing from origin's copy when it exists.

    Later stages (review, verify, rework builds) must see the work earlier
    stages pushed, so an existing remote branch always wins over a fresh one
    cut from the default branch.
    """
    if not (root / ".git").exists():
        return branch
    fetched = _run_git(
        ["fetch", "--depth", "50", "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}"], cwd=str(root)
    ).returncode == 0
    if fetched:
        result = _run_git(["checkout", "-B", branch, f"origin/{branch}"], cwd=str(root))
    elif create:
        result = _run_git(["checkout", "-B", branch], cwd=str(root))
    else:
        result = _run_git(["checkout", branch], cwd=str(root))
        if result.returncode != 0:  # branch may not exist yet — create it
            result = _run_git(["checkout", "-B", branch], cwd=str(root))
    if result.returncode != 0:
        raise RuntimeError(f"git checkout failed: {result.stderr.strip()}")
    return branch


def commit_and_push(root: Path, branch: str, message: str) -> bool:
    """Commit all changes and push the branch. Returns True when a push happened."""
    if not (root / ".git").exists():
        return False
    _run_git(["config", "user.email", "engineer@gravel.local"], cwd=str(root))
    _run_git(["config", "user.name", "Gravel Engineer"], cwd=str(root))
    _run_git(["add", "-A"], cwd=str(root))
    commit = _run_git(["commit", "-m", message], cwd=str(root))
    # "nothing to commit" is fine — push whatever the branch holds
    push = _run_git(["push", "-u", "origin", branch], cwd=str(root))
    if push.returncode != 0:
        raise RuntimeError(f"git push failed: {push.stderr.strip()}")
    return commit.returncode == 0


BUNDLE_DIR = ".gravel"


def write_bundle(root: Path, bundle: dict[str, str]) -> Path:
    """Write the task bundle into <repo>/.gravel/ and keep it out of git.

    The exclusion goes in .git/info/exclude (local to this clone), so the
    user's .gitignore is never modified and bundle files are never committed.
    """
    base = root / BUNDLE_DIR
    if base.exists():
        shutil.rmtree(base)
    (base / "output").mkdir(parents=True)
    for filename, content in bundle.items():
        target = (base / filename).resolve()
        if base.resolve() not in target.parents:
            continue  # never write outside the bundle directory
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    exclude = root / ".git" / "info" / "exclude"
    if exclude.parent.exists():
        current = exclude.read_text() if exclude.exists() else ""
        if f"/{BUNDLE_DIR}/" not in current.splitlines():
            exclude.write_text(current.rstrip("\n") + f"\n/{BUNDLE_DIR}/\n")
    return base
