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
    # "opencode", "claude-code" or "codex" (agentic CLIs), or "llm" (single API call)
    executor: str = "opencode"
    opencode_command: str = "opencode"
    claude_command: str = "claude"
    codex_command: str = "codex"
    codex_sandbox: str = "workspace-write"  # `codex exec --sandbox`; network stays off inside it
    codex_args: str = ""  # extra `codex exec` flags, shell-quoted
    claude_max_turns: int = 0  # 0 = no turn limit (the 60-minute timeout still applies)
    claude_subagents: bool = True  # pass the bundle's subagents (.gravel/claude/agents.json)
    claude_test_gate: bool = True  # run the project's tests before a code-writing run finishes
    github_token: str = ""
    # Local runners: clone GitHub repos over SSH (your own keys) instead of HTTPS
    git_ssh: bool = False
    dry_run: bool = False

    model_config = {"env_prefix": "GRAVEL_"}


config = RuntimeConfig()
