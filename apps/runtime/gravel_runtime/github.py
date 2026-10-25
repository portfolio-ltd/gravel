"""Minimal GitHub REST helpers for the runtime."""
import httpx

from .config import config

API = "https://api.github.com"


def _repo_slug(repo_url: str) -> str:
    path = repo_url.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return "/".join(path.split("github.com/")[-1].split("/")[:2])


def create_or_get_pull_request(repo_url: str, branch: str, base: str, title: str, body: str) -> str | None:
    if not config.github_token:
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
