"""Minimal GitHub REST helpers for the runtime."""
import shutil
import subprocess

import httpx

from .config import config

API = "https://api.github.com"


def _repo_slug(repo_url: str) -> str:
    path = repo_url.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return "/".join(path.split("github.com/")[-1].split("/")[:2])


def _gh_pull_request(slug: str, branch: str, base: str, title: str, body: str) -> str | None:
    """Without a token, a local runner opens the PR with the person's own `gh` login."""
    created = subprocess.run(
        ["gh", "pr", "create", "--repo", slug, "--head", branch, "--base", base, "--title", title, "--body", body],
        capture_output=True, text=True, timeout=120,
    )
    if created.returncode == 0 and created.stdout.strip():
        return created.stdout.strip().splitlines()[-1]
    existing = subprocess.run(
        ["gh", "pr", "list", "--repo", slug, "--head", branch, "--state", "open", "--json", "url", "--jq", ".[0].url"],
        capture_output=True, text=True, timeout=120,
    )
    return existing.stdout.strip() or None


def create_or_get_pull_request(repo_url: str, branch: str, base: str, title: str, body: str) -> str | None:
    if not config.github_token:
        if shutil.which("gh"):
            return _gh_pull_request(_repo_slug(repo_url), branch, base, title, body)
        return None
    slug = _repo_slug(repo_url)
    headers = {
        "Authorization": f"token {config.github_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{API}/repos/{slug}/pulls",
            headers=headers,
            json={"title": title, "body": body, "head": branch, "base": base},
        )
        if resp.status_code == 201:
            return resp.json()["html_url"]
        if resp.status_code == 422:  # already exists
            existing = client.get(
                f"{API}/repos/{slug}/pulls",
                headers=headers,
                params={"head": f"{slug.split('/')[0]}:{branch}", "state": "open"},
            )
            if existing.status_code == 200 and existing.json():
                return existing.json()[0]["html_url"]
    return None
