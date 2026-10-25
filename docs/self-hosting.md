# Self-hosting Gravel

## Requirements

- Docker + Docker Compose on a Linux host (2 GB RAM to start; each running
  engineer runtime adds roughly 512 MB)
- A domain and a TLS-terminating reverse proxy for anything public

## 1. Configure

```bash
cp .env.example .env
```

Generate the two secrets — and keep them stable:

```bash
# SECRET_KEY — signs session tokens
openssl rand -hex 32
# ENCRYPTION_KEY — Fernet key for stored API keys, Git tokens, deploy configs
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set at least: `SECRET_KEY`, `ENCRYPTION_KEY`, `ALLOWED_ORIGINS`,
`NEXT_PUBLIC_API_URL`, `WEB_BASE_URL`, and `SHOW_DOCS=false`.

## 2. Run

```bash
docker compose up --build -d
```

The stack runs Postgres 16, Redis, the API (migrations run on start) and the
web app. Set `SEED_DEMO=true` to also create demo users (password `demo1234`)
and sample projects — useful for evaluation, **never on a public deployment**.
Postgres and Redis ports are bound to `127.0.0.1` only.

`NEXT_PUBLIC_API_URL` is baked into the web image at build time — rebuild the
web image when the API origin changes:

```bash
docker compose build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com web
```

## 3. Reverse proxy

Caddy (automatic TLS):

```
gravel.example.com {
    reverse_proxy localhost:3000
}
api.gravel.example.com {
    reverse_proxy localhost:8000
}
```

nginx needs WebSocket upgrade headers on `/ws/`:

```nginx
location /ws/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Database

Postgres is recommended. For a managed database, drop the `db` service and set
`DOCKER_DATABASE_URL=postgresql+asyncpg://…` (and `DATABASE_SSL=require` if the
provider needs TLS).

## Redis

Optional for a single API worker; required for real-time updates when running
more than one worker (the compose file runs two).

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and
`WEB_BASE_URL` for verification and password-reset emails. Without SMTP the
links are written to the API log.

## Engineer runtimes

`RUNTIME_MODE=docker` lets the API launch engineer containers through the
mounted Docker socket (`/var/run/docker.sock`). Anything with access to that
socket is effectively root on the host, and runtimes execute AI-written code —
run Gravel on a dedicated host or VM, or use `RUNTIME_MODE=simulated` to rely
on the in-process executor only. Build the runtime image ahead of time with:

```bash
docker build -t gravel-engineer:latest apps/runtime
```

## Upgrading

```bash
git pull
docker compose up --build -d   # runs `alembic upgrade head` on start
```

Outside Docker: `cd apps/api && .venv/bin/alembic upgrade head`.

## Key rotation

- Rotating `SECRET_KEY` signs everyone out. Safe at any time.
- Rotating `ENCRYPTION_KEY` makes stored provider keys, Git tokens and deploy
  configs unreadable; users must re-enter them.

## Production checklist

- [ ] Fixed `SECRET_KEY` and `ENCRYPTION_KEY`
- [ ] `SHOW_DOCS=false`, `DEBUG=false`
- [ ] `ALLOWED_ORIGINS` limited to your web origin
- [ ] Demo seeding removed from the api command
- [ ] Postgres backups
- [ ] Decided on `RUNTIME_MODE` (Docker socket exposure)
