from pydantic_settings import BaseSettings


class RuntimeConfig(BaseSettings):
    api_base_url: str = "http://host.docker.internal:8000"
    engineer_id: str = ""
    runtime_id: str = ""
    runtime_token: str = ""
    model_provider: str = "anthropic"
    model_name: str = "claude-opus-5-5"
    poll_interval_seconds: int = 15
    heartbeat_interval_seconds: int = 60
    workspace_dir: str = "/tmp/gravel-runtime"
    executor: str = "opencode"  # "opencode" (agentic CLI) or "llm" (single API call)
    opencode_command: str = "opencode"
    github_token: str = ""
    dry_run: bool = False

    model_config = {"env_prefix": "GRAVEL_"}


config = RuntimeConfig()
