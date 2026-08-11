FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Agentic executor + deployment tooling
RUN npm install -g opencode-ai && pip install --no-cache-dir awscli

WORKDIR /app
COPY pyproject.toml ./
COPY gravel_runtime ./gravel_runtime
RUN pip install --no-cache-dir ".[llm]"

CMD ["python", "-m", "gravel_runtime.main"]
