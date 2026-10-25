FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Agentic executors + deployment tooling. The Claude Code npm package picks
# its native binary per platform, so amd64 and arm64 builds both work.
ARG CLAUDE_CODE_VERSION=2.1.308
RUN npm install -g opencode-ai "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && pip install --no-cache-dir awscli

WORKDIR /app
COPY pyproject.toml ./
COPY gravel_runtime ./gravel_runtime
RUN pip install --no-cache-dir ".[llm]"

CMD ["python", "-m", "gravel_runtime.main"]
