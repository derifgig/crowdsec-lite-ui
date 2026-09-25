# Installation

## Prerequisites

- Docker + Docker Compose
- CrowdSec running and accessible

## 1. Register a watcher machine in CrowdSec

```bash
docker exec crowdsec cscli machines add crowdsec-lite-ui --password your-password-here
```

## 2. Add to docker-compose.yml

```yaml
services:
  crowdsec-lite-ui:
    image: derifgjg/crowdsec-lite-ui:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      LAPI_URL: http://crowdsec:8080
      LAPI_USERNAME: crowdsec-lite-ui
      LAPI_PASSWORD: your-password-here
    networks:
      - your-network

networks:
  your-network:
    external: true
```

## 3. Start

```bash
docker compose up -d
```

Open `http://your-server:3000`.

## Optional: Alert context (target hostname in alerts)

To see which host was targeted in each alert, add a context file to CrowdSec:

```bash
cat > /etc/crowdsec/contexts/http_custom.yaml << 'EOF'
context:
  target_fqdn:
    - evt.Meta.target_fqdn
EOF

docker restart crowdsec
```


