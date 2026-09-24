# CrowdSec Lite UI

A minimal self-hosted web dashboard for [CrowdSec](https://crowdsec.net).

**Goals:** view alerts, view active bans, ban/unban IPs — nothing else.

| | |
|---|---|
| Docker image | ~8 MB |
| RAM at idle | ~15 MB |
| Dependencies | zero (Go stdlib only) |
| Database | none |
| Background processes | none |

## Quick start

```yaml
# docker-compose.yml
services:
  crowdsec-lite-ui:
    image: derifgjg/crowdsec-lite-ui:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      LAPI_URL: http://crowdsec:8080
      LAPI_USERNAME: crowdsec-web-ui
      LAPI_PASSWORD: your-password-here
```

```bash
docker compose up -d
```

Open `http://localhost:3000`.

## Configuration

All config via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `LAPI_URL` | ✅ | — | CrowdSec LAPI base URL |
| `LAPI_USERNAME` | ✅ | — | Watcher machine login |
| `LAPI_PASSWORD` | ✅ | — | Watcher machine password |
| `LISTEN_ADDR` | | `:3000` | Listen address |
| `LAPI_SKIP_TLS_VERIFY` | | `false` | Skip TLS cert verification |
| `ALERTS_SINCE` | | `168h` | Default alerts lookback period |

## CrowdSec setup

Register a watcher machine for the UI:

```bash
cscli machines add crowdsec-lite-ui --password your-password-here
```

## Development

```bash
# Local dev (Vite on :5173 + Go on :3000)
LAPI_URL=http://localhost:8080 LAPI_USERNAME=... LAPI_PASSWORD=... make dev

# Build Docker image
make build
```

## Release

Push a `v*` tag to trigger a Docker Hub release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Builds `linux/amd64` and `linux/arm64` images and pushes to `derifgjg/crowdsec-lite-ui`.
