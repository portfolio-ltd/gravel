"""gravel — the command line for a hosted Gravel.

    gravel login                 sign in through the browser (device login), or --token grv_…
    gravel whoami | logout
    gravel projects              your projects
    gravel tasks PROJECT_ID      a project's tasks
    gravel gates                 runs waiting for a human
    gravel approve RUN_ID [-m]   approve a gate
    gravel reject RUN_ID -m …    request changes
    gravel work                  run tasks on this machine with your own Claude Code or Codex login

`gravel work` registers this machine as a local runner and then speaks the
ordinary runtime protocol (main.py). Your AI CLI's login and your git
credentials stay on this machine; the server only sees results.
"""
import argparse
import json
import logging
import os
import shutil
import signal
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import httpx

DEFAULT_SERVER = "https://api.trygravel.com"
EXECUTORS = {"claude-code": ("claude_command", "anthropic", "claude-opus-5-5"),
             "codex": ("codex_command", "openai", ""),
             "opencode": ("opencode_command", "anthropic", "claude-opus-5-5")}

logger = logging.getLogger("gravel")


def config_dir() -> Path:
    if os.environ.get("GRAVEL_CONFIG_DIR"):
        return Path(os.environ["GRAVEL_CONFIG_DIR"])
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "gravel"


def load_credentials() -> dict:
    path = config_dir() / "credentials.json"
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def save_credentials(data: dict) -> Path:
    directory = config_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / "credentials.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)  # never world-readable, even briefly
    with os.fdopen(fd, "w") as handle:
        json.dump(data, handle, indent=2)
    os.chmod(path, 0o600)
    return path


class Api:
    def __init__(self, server: str, token: str | None = None, org_id: str | None = None,
                 transport: httpx.BaseTransport | None = None) -> None:
        headers = {"User-Agent": "gravel-cli"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if org_id:
            headers["X-Org-Id"] = org_id
        self.server = server.rstrip("/")
        self._client = httpx.Client(base_url=self.server, headers=headers, timeout=60, transport=transport)

    def call(self, method: str, path: str, body: dict | None = None) -> dict | list | None:
        try:
            resp = self._client.request(method, path, json=body)
        except httpx.HTTPError as exc:
            raise SystemExit(f"Can't reach {self.server}: {exc}")
        if resp.status_code == 401:
            raise SystemExit("Not signed in, or the token was revoked — run `gravel login`.")
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail")
            except ValueError:
                detail = resp.text
            raise SystemExit(f"{method} {path} failed ({resp.status_code}): {detail}")
        return resp.json() if resp.content else None


def _api(args, transport=None) -> Api:
    creds = load_credentials()
    if not creds.get("token"):
        raise SystemExit("Not signed in — run `gravel login`.")
    return Api(creds.get("server") or DEFAULT_SERVER, creds["token"], creds.get("org_id"), transport)


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_login(args, transport=None) -> int:
    server = (args.server or load_credentials().get("server") or DEFAULT_SERVER).rstrip("/")
    token = args.token
    if not token:
        api = Api(server, transport=transport)
        start = api.call("POST", "/api/auth/device/start", {"client_name": f"gravel CLI on {socket.gethostname()}"})
        print(f"Open {start['verification_uri']} and confirm the code {start['user_code']}", flush=True)
        if not args.no_browser:
            webbrowser.open(start["verification_uri_complete"])
        deadline = time.monotonic() + start["expires_in"]
        while time.monotonic() < deadline:
            time.sleep(start["interval"])
            poll = api.call("POST", "/api/auth/device/token", {"device_code": start["device_code"]})
            if poll["status"] == "approved":
                token = poll["access_token"]
                break
            if poll["status"] in ("denied", "expired"):
                raise SystemExit(f"Login {poll['status']}.")
        else:
            raise SystemExit("Login timed out — run `gravel login` again.")
    me = Api(server, token, args.org, transport).call("GET", "/api/auth/me")
    path = save_credentials({"server": server, "token": token, "org_id": args.org})
    print(f"Signed in to {server} as {me['name']} <{me['email']}> (token saved in {path})")
    return 0


def cmd_logout(args) -> int:
    path = config_dir() / "credentials.json"
    if path.exists():
        path.unlink()
    print("Signed out on this machine. Revoke the token under Settings → API tokens if it may have leaked.")
    return 0


def cmd_whoami(args, transport=None) -> int:
    api = _api(args, transport)
    me = api.call("GET", "/api/auth/me")
    print(f"{me['name']} <{me['email']}> on {api.server}")
    return 0


def cmd_projects(args, transport=None) -> int:
    for p in _api(args, transport).call("GET", "/api/projects"):
        print(f"{p['id']}  {p['status']:<8} {p['progress']:>3}%  {p['name']}")
    return 0


def cmd_tasks(args, transport=None) -> int:
    project = _api(args, transport).call("GET", f"/api/projects/{args.project}")
    status = {t["id"]: t["status"] for t in project["tasks"]}
    for t in sorted(project["tasks"], key=lambda t: t["position"]):
        waiting = sum(1 for d in t.get("depends_on") or [] if status.get(d, "done") != "done")
        note = f"  (waiting on {waiting})" if waiting and t["status"] != "done" else ""
        print(f"{t['id']}  {t['status']:<11} {t['title']}{note}")
    return 0


def cmd_gates(args, transport=None) -> int:
    gates = _api(args, transport).call("GET", "/api/overview/attention-tasks")
    if not gates:
        print("Nothing is waiting for you.")
    for g in gates:
        print(f"{g['run_id']}  {g['project_name']} / {g['task_title']}\n    {g['outcome']}: {g['blocking_reason'] or ''}")
    return 0


def cmd_approve(args, transport=None) -> int:
    _api(args, transport).call("POST", f"/api/task-runs/{args.run}/approve", {"note": args.message})
    print("Approved.")
    return 0


def cmd_reject(args, transport=None) -> int:
    _api(args, transport).call("POST", f"/api/task-runs/{args.run}/reject", {"note": args.message, "rework": True})
    print("Changes requested — the task goes back for rework.")
    return 0


def cmd_work(args, transport=None) -> int:
    from . import jobs, main
    from .client import GravelClient
    from .config import config

    attr, provider, default_model = EXECUTORS[args.executor]
    binary = getattr(config, attr)
    if not shutil.which(binary):
        raise SystemExit(f"'{binary}' isn't on your PATH. Install it and sign in first "
                         f"({'claude' if args.executor == 'claude-code' else args.executor} login).")
    api = _api(args, transport)
    reg = api.call("POST", "/api/runners/register", {
        "host_label": args.name or socket.gethostname(), "executor": args.executor,
        "scope": "org" if args.team else "mine",
    })
    config.api_base_url = api.server
    config.runtime_id, config.engineer_id, config.runtime_token = reg["runtime_id"], reg["engineer_id"], reg["runtime_token"]
    config.executor = args.executor
    config.model_provider, config.model_name = provider, args.model or default_model
    config.poll_interval_seconds = reg["poll_interval_seconds"]
    config.heartbeat_interval_seconds = reg["heartbeat_interval_seconds"]
    config.workspace_dir = str(Path(args.workdir).expanduser()) if args.workdir else str(
        Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "gravel" / "work")
    config.git_ssh = args.ssh or config.git_ssh
    client = GravelClient()
    who = "projects you own" if reg["scope"] == "mine" else "your whole organization"
    print(f"Runner '{reg['engineer_name']}' is online, using {args.executor} ({who}). Ctrl+C to stop.")

    stop = threading.Event()

    def answer_jobs() -> None:  # keyless model calls, answered while a long run may be going on
        while not stop.wait(3):
            try:
                job = client.poll_next_job()
                if job:
                    logger.info("answering a model call (%s)", job.get("model") or "default model")
                    client.post_job_result(job["id"], jobs.run_job(job))
            except Exception as exc:
                logger.warning("job poll failed: %s", exc)

    threading.Thread(target=answer_jobs, daemon=True).start()

    def interrupt(signum, frame):  # `kill`, or the terminal closing, stops the runner like Ctrl+C
        raise KeyboardInterrupt

    for sig in (signal.SIGTERM, getattr(signal, "SIGHUP", None)):
        if sig is not None:
            signal.signal(sig, interrupt)
    done = 0
    try:
        while not stop.is_set():
            try:
                client.engineer_heartbeat()
                payload = client.poll_next_task()
                if payload.get("task_run"):
                    main._execute_run(client, payload)
                    done += 1
                    if args.once:
                        break
                    continue
                if args.once:
                    break
            except Exception as exc:
                if "-> 401" in str(exc):  # the runner was stopped from Gravel (or its token revoked)
                    print("This runner was stopped from Gravel.")
                    break
                logger.warning("poll cycle failed: %s", exc)
            stop.wait(config.poll_interval_seconds)
    except KeyboardInterrupt:
        print("\nStopping…")
    finally:
        stop.set()
        try:
            client.stop_runner()
        except Exception as exc:
            logger.warning("could not mark the runner offline: %s", exc)
    print(f"Runner stopped after {done} run{'s' if done != 1 else ''}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gravel", description="Gravel from the command line.")
    sub = parser.add_subparsers(dest="command", required=True)

    login = sub.add_parser("login", help="sign in (opens the browser)")
    login.add_argument("--server", help=f"API URL (default {DEFAULT_SERVER})")
    login.add_argument("--token", help="use an API token from Settings → API tokens instead of the browser")
    login.add_argument("--org", help="organization id to act in (default: your personal one)")
    login.add_argument("--no-browser", action="store_true", help="only print the link")
    sub.add_parser("logout", help="forget the saved token")
    sub.add_parser("whoami", help="show who you're signed in as")
    sub.add_parser("projects", help="list projects")
    tasks = sub.add_parser("tasks", help="list a project's tasks")
    tasks.add_argument("project")
    sub.add_parser("gates", help="runs waiting for a human")
    approve = sub.add_parser("approve", help="approve a gated run")
    approve.add_argument("run")
    approve.add_argument("-m", "--message", help="note for the record")
    reject = sub.add_parser("reject", help="request changes on a gated run")
    reject.add_argument("run")
    reject.add_argument("-m", "--message", required=True, help="what needs to change")

    work = sub.add_parser("work", help="run tasks on this machine")
    work.add_argument("--executor", choices=sorted(EXECUTORS), default="claude-code",
                      help="the AI CLI you're signed in to (default claude-code)")
    work.add_argument("--model", help="model for the executor (default: Gravel's choice, or Codex's default)")
    work.add_argument("--name", help="how this machine shows up in Gravel (default: hostname)")
    work.add_argument("--team", action="store_true", help="take runs from the whole organization, not just your projects")
    work.add_argument("--ssh", action="store_true", help="clone GitHub repos over SSH with your own keys")
    work.add_argument("--workdir", help="where task checkouts go (default ~/.cache/gravel/work)")
    work.add_argument("--once", action="store_true", help="take at most one run, then exit")
    return parser


COMMANDS = {"login": cmd_login, "logout": cmd_logout, "whoami": cmd_whoami, "projects": cmd_projects,
            "tasks": cmd_tasks, "gates": cmd_gates, "approve": cmd_approve, "reject": cmd_reject, "work": cmd_work}


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per request drowns the run log
    args = build_parser().parse_args(argv)
    return COMMANDS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
