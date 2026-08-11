"""
GitHub integration service.
Uses the GitHub REST API via httpx — no heavy SDK dependency.
"""
import logging

import httpx

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _parse_repo(repo_url: str) -> tuple[str, str]:
    """Extract owner/repo from https://github.com/owner/repo[.git]"""
    path = repo_url.rstrip("/").rstrip(".git")
    parts = path.split("github.com/")[-1].split("/")
    if len(parts) < 2:
        raise ValueError(f"Invalid GitHub repo URL: {repo_url}")
    return parts[0], parts[1]


async def verify_access(repo_url: str, token: str) -> dict:
    """Check that the token can read the given repo."""
    owner, repo = _parse_repo(repo_url)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=_headers(token))
        if resp.status_code == 200:
            data = resp.json()
            return {"ok": True, "full_name": data["full_name"], "default_branch": data["default_branch"]}
        return {"ok": False, "error": resp.text}


async def create_branch(repo_url: str, token: str, branch_name: str, base_branch: str = "main") -> dict:
    """Create a new branch from base_branch."""
    owner, repo = _parse_repo(repo_url)
    async with httpx.AsyncClient(timeout=10) as client:
        # Get base SHA
        ref_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/ref/heads/{base_branch}",
            headers=_headers(token),
        )
        if ref_resp.status_code != 200:
            return {"ok": False, "error": f"Base branch '{base_branch}' not found"}
        sha = ref_resp.json()["object"]["sha"]

        # Create branch
        create_resp = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/refs",
            headers=_headers(token),
            json={"ref": f"refs/heads/{branch_name}", "sha": sha},
        )
        if create_resp.status_code in (201, 422):  # 422 = already exists
            return {"ok": True, "branch": branch_name, "sha": sha}
        return {"ok": False, "error": create_resp.text}


async def create_pull_request(repo_url: str, token: str, title: str, body: str, head: str, base: str = "main") -> dict:
    """Open a PR from head branch into base."""
    owner, repo = _parse_repo(repo_url)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls",
            headers=_headers(token),
            json={"title": title, "body": body, "head": head, "base": base},
        )
        if resp.status_code == 201:
            data = resp.json()
            return {"ok": True, "pr_url": data["html_url"], "pr_number": data["number"]}
        return {"ok": False, "error": resp.text}


async def list_branches(repo_url: str, token: str) -> list[str]:
    owner, repo = _parse_repo(repo_url)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/branches",
            headers=_headers(token),
            params={"per_page": 100},
        )
        if resp.status_code == 200:
            return [b["name"] for b in resp.json()]
        return []
