"""Gravel engineer runtime: heartbeat, poll, execute, report — forever."""
import logging
import threading
import time

from . import executor, github, workspace
from .client import GravelClient
from .config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gravel-runtime")

# Stage roles that change code; every other role only reads the repo and
# reports documents back to Gravel, so it never pushes or opens a PR.
CODE_ROLES = {"build", "custom"}

PHASE_COMPLETE = {
    "grooming": "grooming_complete",
    "build": "build_complete",
    "testing": "testing_complete",
    "deployment": "deployment_complete",
}


def _heartbeat_loop(client: GravelClient, run_id: str | None, stop: threading.Event) -> None:
    while not stop.wait(config.heartbeat_interval_seconds):
        try:
            client.engineer_heartbeat()
            if run_id:
                client.run_heartbeat(run_id)
        except Exception as exc:
            logger.warning("heartbeat failed: %s", exc)


def _branch_for(task: dict, phase: str, project: dict, stage: dict | None) -> tuple[str, bool]:
    """(branch to work on, create it?)"""
    existing = task.get("branch_name")
    default = project.get("default_branch") or "main"
    if stage:  # custom workflow stages always work on the task branch
        return existing or f"gravel/task-{task['id'][:8]}", True
    if phase == "deployment":
        return default, False
    if phase == "build":
        branch = existing or f"gravel/task-{task['id'][:8]}"
        return branch, True
    return existing or default, False


def _execute_run(client: GravelClient, payload: dict) -> None:
    run = payload["task_run"]
    task = payload["task"]
    project = payload["project"]
    bundle = payload["bundle"] or {}
    stage = payload.get("workflow_stage")
    phase = run["phase"]
    run_id = run["id"]
    unit = f"stage '{stage['name']}'" if stage else f"{phase} phase"

    stop = threading.Event()
    hb = threading.Thread(target=_heartbeat_loop, args=(client, run_id, stop), daemon=True)
    hb.start()

    try:
        branch, create = _branch_for(task, phase, project, stage)
        root = workspace.prepare_workspace(task["id"], project.get("repo_url"), project.get("default_branch") or "main")
        actual_branch = workspace.checkout_branch(root, branch, create) if project.get("repo_url") else None
        workspace.write_bundle(root, bundle)
        provider, model, model_note = executor.select_model(payload)
        if model_note:
            client.post_log(run_id, model_note, level="warn")
        client.post_log(run_id, f"Workspace ready (branch: {actual_branch or 'no repo'}). "
                                f"Executing {unit} via {config.executor} on {model}.")

        result = executor.execute(root, provider, model)
        outcome_type = result.get("outcome_type", "failed")
        summary = result.get("summary", "")
        pr_url = None

        writes_code = (stage.get("role", "custom") in CODE_ROLES) if stage else phase in ("build", "testing")
        if outcome_type == "completed":
            pushed = False
            outcome_type = "build_complete" if stage else PHASE_COMPLETE.get(phase, "failed")
            do_push = project.get("repo_url") and config.executor != "llm" and writes_code
            if do_push:
                try:
                    pushed = workspace.commit_and_push(
                        root, actual_branch,
                        f"Gravel task {task['id'][:8]}: {stage['name'] if stage else phase} — {task['title'][:60]}",
                    )
                    client.post_log(run_id, f"Branch {actual_branch} pushed ({'new commit' if pushed else 'no new commit'}).")
                except Exception as exc:
                    client.post_log(run_id, f"Push failed: {exc}", level="error")
                    outcome_type = "blocked"
                    result["blocking_reason"] = f"Could not push branch: {exc}"
            # PR: fixed-pipeline build always; stage runs only when they actually committed
            want_pr = outcome_type == "build_complete" and project.get("repo_url") and actual_branch \
                and (pushed if stage else phase == "build")
            if want_pr:
                pr_url = github.create_or_get_pull_request(
                    project["repo_url"], actual_branch, project.get("default_branch") or "main",
                    f"Gravel: {task['title']}", summary or "Automated change by a Gravel engineer.",
                )
                if pr_url:
                    client.post_log(run_id, f"Pull request ready: {pr_url}")

        client.post_outcome(run_id, {
            "outcome": outcome_type,
            "summary": summary,
            "blocking_reason": result.get("blocking_reason"),
            "branch_name": actual_branch if (writes_code or (not stage and phase != "grooming")) else None,
            "pr_url": pr_url,
            "deploy_url": result.get("deploy_url"),
            "tokens_in": result.get("tokens_in"),
            "tokens_out": result.get("tokens_out"),
            "model": model if (result.get("tokens_in") or result.get("tokens_out")) else None,
            **{key: result[key] for key in executor.STRUCTURED_FIELDS if result.get(key)},
        })
        logger.info("run %s finished: %s", run_id, outcome_type)
    except Exception as exc:
        logger.exception("run %s crashed", run_id)
        try:
            client.post_log(run_id, f"Runtime error: {exc}", level="error")
            client.post_outcome(run_id, {"outcome": "failed", "summary": f"Runtime error: {exc}"})
        except Exception:
            logger.exception("could not report failure for run %s", run_id)
    finally:
        stop.set()


def main() -> None:
    client = GravelClient()
    logger.info("Gravel runtime %s starting (engineer %s, executor %s)",
                config.runtime_id, config.engineer_id, config.executor)
    while True:
        try:
            client.engineer_heartbeat()
            payload = client.poll_next_task()
            if payload.get("task_run"):
                _execute_run(client, payload)
                continue  # poll again immediately after finishing work
        except Exception as exc:
            logger.warning("poll cycle failed: %s", exc)
        time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    main()
