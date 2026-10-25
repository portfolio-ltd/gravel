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


def normalize_repo(value: str) -> str:
    """'owner/repo' from a URL, SSH remote, or 'owner/repo' string."""
    v = value.strip()
    if v.startswith("git@"):
        v = v.split(":", 1)[-1]
    if "github.com/" in v:
        v = v.split("github.com/", 1)[-1]
    v = v.split("?", 1)[0].split("#", 1)[0].strip("/")
    if v.endswith(".git"):
        v = v[: -len(".git")]
    parts = [p for p in v.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Not a GitHub repository: {value!r}")
    return f"{parts[0]}/{parts[1]}"


def _parse_repo(repo_url: str) -> tuple[str, str]:
    """Extract (owner, repo) from https://github.com/owner/repo[.git] and friends."""
    owner, repo = normalize_repo(repo_url).split("/")
    return owner, repo


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


async def list_issues(repo: str, token: str | None, state: str = "open",
                      labels: str | None = None, limit: int = 50) -> list[dict]:
    """Issues (not pull requests) from a repo, newest first."""
    owner, name = _parse_repo(repo)
    params = {"state": state, "per_page": min(limit, 100), "sort": "created", "direction": "desc"}
    if labels:
        params["labels"] = labels
    headers = _headers(token) if token else {"Accept": "application/vnd.github.v3+json"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{GITHUB_API}/repos/{owner}/{name}/issues", headers=headers, params=params)
    if resp.status_code != 200:
        raise RuntimeError(f"GitHub returned {resp.status_code}: {resp.text[:200]}")
    return [i for i in resp.json() if "pull_request" not in i][:limit]


async def post_issue_comment(repo: str, token: str, number: int, body: str) -> bool:
    owner, name = _parse_repo(repo)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{owner}/{name}/issues/{number}/comments",
            headers=_headers(token), json={"body": body},
        )
    if resp.status_code >= 300:
        logger.warning("GitHub comment on %s#%s failed: %s", repo, number, resp.status_code)
        return False
    return True
