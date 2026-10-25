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
    executor: str = "opencode"  # "opencode" or "claude-code" (agentic CLIs), or "llm" (single API call)
    opencode_command: str = "opencode"
    claude_command: str = "claude"
    claude_max_turns: int = 0  # 0 = no turn limit (the 60-minute timeout still applies)
    github_token: str = ""
    dry_run: bool = False

    model_config = {"env_prefix": "GRAVEL_"}


config = RuntimeConfig()
