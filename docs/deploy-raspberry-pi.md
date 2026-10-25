# Deploying on a Raspberry Pi with Cloudflare Tunnel

This guide runs Gravel on a Raspberry Pi at home and publishes it through a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
so no router ports are opened and TLS is handled by Cloudflare. Read
[self-hosting.md](self-hosting.md) first for what each setting means.

## What you need

- Raspberry Pi 5 or 4 with **8 GB RAM** (4 GB works with `RUNTIME_MODE=simulated`)
- **64-bit** Raspberry Pi OS (Bookworm or later) — the images are `linux/arm64`
- An SSD over USB 3 / NVMe rather than an SD card (Postgres writes wear SD cards out)
- A domain on Cloudflare (free plan is fine)

## 1. Prepare the Pi

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
git clone https://github.com/portfolio-ltd/gravel.git && cd gravel
```

## 2. Create the tunnel

In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a
tunnel → Cloudflared**. Name it `gravel` and copy the token. Then add two
public hostnames to the tunnel:

| Public hostname | Service |
|---|---|
| `gravel.example.com` | `http://web:3000` |
| `api.gravel.example.com` | `http://api:8000` |

`web` and `api` are the compose service names; `cloudflared` runs on the same
Docker network, so it reaches them directly. WebSockets work through the
tunnel without extra settings.

## 3. Configure

```bash
cp .env.example .env
openssl rand -hex 32   # → SECRET_KEY
docker run --rm python:3.12-slim sh -c \
  "pip -q install cryptography && python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"   # → ENCRYPTION_KEY
```

Set in `.env`:

```bash
SECRET_KEY=…
ENCRYPTION_KEY=…
ALLOWED_ORIGINS=https://gravel.example.com
NEXT_PUBLIC_API_URL=https://api.gravel.example.com
WEB_BASE_URL=https://gravel.example.com
SHOW_DOCS=false
DEBUG=false
SEED_DEMO=false
BIND_ADDR=127.0.0.1          # only the tunnel reaches the app
CLOUDFLARE_TUNNEL_TOKEN=…
RUNTIME_MODE=simulated       # or docker — see below
```

**Runtime mode.** `docker` lets Gravel start engineer containers on the Pi
(about 512 MB each) through the Docker socket, which is root-equivalent — only
do this on a Pi dedicated to Gravel. `simulated` uses the in-process executor
with your provider key and needs no extra containers.

## 4. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up --build -d
```

The first build compiles the web app for your domain and takes roughly 10–15
minutes on a Pi 5. To save time on the API, you can pull the release image
instead of building it:

```bash
echo 'GRAVEL_API_IMAGE=ghcr.io/portfolio-ltd/gravel-api:0.1' >> .env
docker compose pull api
```

The web image must be built on the Pi (or anywhere with
`--build-arg NEXT_PUBLIC_API_URL=https://api.gravel.example.com`), because the
API URL is baked in at build time.

Open `https://gravel.example.com` and create your account.

## 5. Operate

- **Logs**: `docker compose logs -f api`
- **Upgrade**:
  ```bash
  git pull
  docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up --build -d
  ```
  Migrations run when the API starts.
- **Backups** (nightly cron to another disk):
  ```bash
  docker compose exec -T db pg_dump -U gravel gravel | gzip > /mnt/backup/gravel-$(date +%F).sql.gz
  ```
  Keep `.env` backed up too — without the same `ENCRYPTION_KEY`, stored
  provider keys and Git tokens cannot be decrypted.
- **Uploads**: Cloudflare's free plan limits request bodies to 100 MB.

## Troubleshooting

- **Login bounces back to `/login`** — `ALLOWED_ORIGINS` must be exactly the
  web origin, and the web image must have been built with the right
  `NEXT_PUBLIC_API_URL`. Rebuild `web` after changing it.
- **Tunnel shows 502** — check `docker compose ps`; the hostnames must point
  at `web:3000` / `api:8000`, not `localhost`.
- **Out of memory during build** — raise `CONF_SWAPSIZE` in `/etc/dphys-swapfile`, or build
  the web image on another machine with `docker buildx build --platform linux/arm64`.
