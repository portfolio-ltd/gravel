.PHONY: dev api web migrate migrate-create seed test-api test-web test lint-api lint-web lint install setup env-setup

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
	@echo "--- Creating Python 3.11 venv ---"
	python3.11 -m venv apps/api/.venv || python3 -m venv apps/api/.venv
	@echo "--- Installing Python deps ---"
	apps/api/.venv/bin/pip install -r apps/api/requirements.txt
	@echo "--- Installing Node deps ---"
	cd apps/web && npm install

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

test-web:
	cd apps/web && npm run test

test: test-api test-web

# ── Lint ──────────────────────────────────────────────────────────────────────
lint-api:
	cd apps/api && .venv/bin/python -m ruff check .

lint-web:
	cd apps/web && npm run lint

lint: lint-api lint-web
