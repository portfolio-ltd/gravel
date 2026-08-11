"""HTTP client for the Gravel API, authenticated by the runtime launch token."""
import httpx

from .config import config


class GravelClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            base_url=config.api_base_url,
            headers={"Authorization": f"Bearer {config.runtime_token}"},
            timeout=30,
        )

    def _post(self, path: str, payload: dict | None = None) -> dict:
        resp = self._client.post(path, json=payload or {})
        if resp.status_code >= 400:
            raise RuntimeError(f"{path} -> {resp.status_code}: {resp.text}")
        return resp.json() if resp.content else {}

    def engineer_heartbeat(self) -> None:
        self._post(f"/api/engineers/runtimes/{config.runtime_id}/heartbeat")

    def poll_next_task(self) -> dict:
        return self._post("/api/agent/poll-next-task")

    def run_heartbeat(self, run_id: str) -> None:
        self._post(f"/api/agent/task-runs/{run_id}/heartbeat")

    def post_log(self, run_id: str, message: str, level: str = "info") -> None:
        self._post(f"/api/agent/task-runs/{run_id}/logs", {"message": message, "level": level})

    def post_outcome(self, run_id: str, outcome: dict) -> None:
        self._post(f"/api/agent/task-runs/{run_id}/outcome", outcome)
