# Deploying Gravel

## What "live" needs

- A Linux host with Docker + Docker Compose (Linode/DO/EC2 — 2 GB RAM is enough
  to start; engineer runtimes add ~512 MB each while running)
- A domain (optional but recommended) + TLS via a reverse proxy
- A `.env` with production values (see below)

## Option A — single server with Docker Compose (recommended)

1. Push the images from your machine (Docker Hub repo `infofractalstech/tech`):

   ```bash
   docker compose build
   docker push infofractalstech/tech:gravel-api
   docker push infofractalstech/tech:gravel-web
   ```

   Note: the web image bakes `NEXT_PUBLIC_API_URL` at build time. For a public
   deploy, rebuild with your real API origin:

   ```bash
   docker compose build --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com web
   ```

2. On the server:

   ```bash
   git clone <this repo> gravel && cd gravel
   cp .env.example .env
   # set: SECRET_KEY (openssl rand -hex 32), ENCRYPTION_KEY (Fernet key),
   #      ALLOWED_ORIGINS=https://yourdomain.com,
   #      NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   docker compose up -d          # or `docker compose pull && up -d` using pushed images
   ```

3. Reverse proxy (Caddy is the least work — automatic TLS):

   ```
   yourdomain.com {
       reverse_proxy localhost:3000
   }
   api.yourdomain.com {
       reverse_proxy localhost:8000
   }
   ```

   With nginx, remember the WebSocket upgrade headers on `/ws/`:

   ```nginx
   location /ws/ {
       proxy_pass http://localhost:8000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

## Option B — managed Postgres (Supabase)

Keep the compose stack but drop the `db` service; in `.env` set:

```
DOCKER_DATABASE_URL=postgresql+asyncpg://<user>:<pw>@<host>:5432/postgres
DATABASE_SSL=require
```

## Key rotation

- `SECRET_KEY` rotation invalidates all sessions (users re-login). Safe anytime.
- `ENCRYPTION_KEY` rotation breaks stored BYOK keys / GitHub tokens / deploy
  configs — users must re-enter them. Rotate deliberately.

## Production checklist

- [ ] `SHOW_DOCS=false`, `DEBUG=false`
- [ ] Fixed `SECRET_KEY` + `ENCRYPTION_KEY` in `.env` (never the generated defaults)
- [ ] `ALLOWED_ORIGINS` = your web origin only
- [ ] Postgres volume backed up (or managed Postgres)
- [ ] Runtime mode: keep `docker` only if you accept Docker-socket exposure on
      the API container; otherwise `simulated`
- [ ] Rebuild the web image whenever the API origin changes
