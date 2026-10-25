# Deploying Gravel

The full guide lives in [docs/self-hosting.md](docs/self-hosting.md); for a
Raspberry Pi behind Cloudflare Tunnel see
[docs/deploy-raspberry-pi.md](docs/deploy-raspberry-pi.md). In short:

```bash
cp .env.example .env      # set SECRET_KEY, ENCRYPTION_KEY, ALLOWED_ORIGINS,
                          # NEXT_PUBLIC_API_URL, WEB_BASE_URL, SHOW_DOCS=false
docker compose up --build -d
```

Before going public:

- Make sure `SEED_DEMO` is unset or `false` (it creates demo users with a known password).
- Change the `image:` names in `docker-compose.yml` to a registry you control
  if you push images.
- Put a TLS reverse proxy in front (Caddy or nginx — remember the WebSocket
  upgrade headers for `/ws/`).
- Decide on `RUNTIME_MODE`: `docker` mounts the Docker socket into the API
  container; `simulated` avoids that and uses the in-process executor.
- Back up Postgres, and keep `ENCRYPTION_KEY` stable (rotating it invalidates
  stored provider keys and Git tokens).
