.PHONY: dev api web migrate migrate-create seed test-api test-runtime test-web test lint-api lint-web lint install setup env-setup

ROOT_DIR := $(shell pwd)

# ── Setup ─────────────────────────────────────────────────────────────────────
# Run this once after cloning: creates .env, symlinks, installs all deps.
setup: env-setup install

env-setup:
	@# Copy .env.example → .env if it doesn't exist yet
	@[ -f .env ] || (cp .env.example .env && echo "Created .env from .env.example — please update the values.")
	@# Symlink apps/web/.env.local → root .env so Next.js picks up all vars
	@ln -sf $(ROOT_DIR)/.env apps/web/.env.local
	@echo "✓  apps/web/.env.local → $(ROOT_DIR)/.env"

install:
	@echo "--- API: Python 3.12 venv (uv) ---"
	cd apps/api && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt ruff
	@echo "--- Runtime: Python 3.12 venv (uv) ---"
	cd apps/runtime && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e ".[test]"
	@echo "--- Web: Node deps ---"
	cd apps/web && npm ci

# ── Dev servers ───────────────────────────────────────────────────────────────
# Run each in a separate terminal.
api:
	cd apps/api && .venv/bin/uvicorn main:app --reload --port 8000

web:
	cd apps/web && npm run dev -- --port 3000

dev:
	@echo "Start the API:  make api"
	@echo "Start the web:  make web"

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	cd apps/api && .venv/bin/alembic upgrade head

migrate-create:
	cd apps/api && .venv/bin/alembic revision --autogenerate -m "$(name)"

seed:
	cd apps/api && .venv/bin/python seed.py

# ── Tests ─────────────────────────────────────────────────────────────────────
test-api:
	cd apps/api && .venv/bin/python -m pytest tests/ -q

test-runtime:
	cd apps/runtime && .venv/bin/python -m pytest -q

test-web:
	cd apps/web && npx tsc --noEmit && npm run test

test: test-api test-runtime test-web

# ── Lint ──────────────────────────────────────────────────────────────────────
lint-api:
	cd apps/api && .venv/bin/python -m ruff check .

lint-web:
	cd apps/web && npm run lint

lint: lint-api lint-web
