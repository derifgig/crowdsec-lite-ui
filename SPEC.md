# CrowdSec Lite UI — Project Specification

## Overview

A minimal, self-hosted web dashboard for CrowdSec. The only goals are:

- View alerts history (from CrowdSec LAPI)
- View active decisions (bans)
- Ban an IP manually
- Unban an IP

No local database. No background sync. No caching layer. The server is a thin proxy between the browser and CrowdSec LAPI.

## Goals

| Goal | Value |
|---|---|
| Docker image size | < 20 MB |
| RAM at idle | < 20 MB |
| RAM under normal use | < 40 MB |
| No background processes | zero timers, zero workers |
| No local database | zero SQLite, zero file storage |
| Single binary | one Go binary + embedded static files |

## Non-Goals

- Notifications
- Metrics / Prometheus
- Multi-instance support
- Geolocation / maps
- Dashboard charts / statistics
- Authentication to the UI itself (protect via reverse proxy if needed)
- Simulation mode
- Audit log

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | Go (stdlib `net/http`) | Single static binary, ~10 MB image, ~15 MB RAM |
| Frontend | React 19 + TypeScript + Vite | Familiar stack, good table/filter components |
| Styling | Tailwind CSS v4 | Minimal output, utility-first |
| Build | Multi-stage Dockerfile | Go binary embeds the built React SPA via `embed.FS` |
| Base image | `scratch` or `gcr.io/distroless/static` | Zero OS overhead |

---

## Project Structure

```
crowdsec-lite-ui/
├── cmd/
│   └── server/
│       └── main.go          # Entry point: config, HTTP server, routes
├── internal/
│   └── lapi/
│       └── client.go        # CrowdSec LAPI client (login, alerts, decisions)
├── web/                     # React SPA source
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── AlertsPage.tsx
│   │   │   └── DecisionsPage.tsx
│   │   ├── components/
│   │   │   ├── AlertsTable.tsx
│   │   │   ├── DecisionsTable.tsx
│   │   │   ├── BanForm.tsx
│   │   │   └── StatusBar.tsx
│   │   └── api/
│   │       └── client.ts    # Typed fetch wrapper for backend API
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Configuration

All configuration is via environment variables. No config file.

| Variable | Required | Default | Description |
|---|---|---|---|
| `LAPI_URL` | yes | — | CrowdSec LAPI base URL, e.g. `http://crowdsec:8080` |
| `LAPI_USERNAME` | yes | — | Machine login (watcher), e.g. `crowdsec-web-ui` |
| `LAPI_PASSWORD` | yes | — | Machine password |
| `LISTEN_ADDR` | no | `:3000` | Address and port to listen on |
| `LAPI_SKIP_TLS_VERIFY` | no | `false` | Skip TLS certificate verification |
| `ALERTS_SINCE` | no | `168h` | Default lookback period for alerts |

---

## Backend API

The Go server exposes a minimal REST API. All routes are under `/api/`.
Static files (the built React SPA) are served from `/`.

### LAPI Authentication

The server authenticates to CrowdSec LAPI using the watcher (machine) login flow:

```
POST /v1/watchers/login
Body: { "machine_id": "...", "password": "...", "scenarios": ["manual/web-ui"] }
Response: { "token": "<jwt>" }
```

The JWT token is stored in memory and reused for all subsequent requests.
On `401` response from LAPI, the server re-authenticates once and retries.
Token refresh is triggered on demand (no background heartbeat).

### Routes

#### Health

```
GET /api/health
Response: { "ok": true, "lapi_connected": true }
```

Returns LAPI connectivity status. Always `200`.

#### Alerts

```
GET /api/alerts?since=168h&limit=100&page=1&ip=1.2.3.4&scenario=http-bf
```

Proxies to LAPI `GET /v1/alerts`. Returns a paginated list of alerts.

Query parameters:

| Param | Default | Description |
|---|---|---|
| `since` | `168h` | Lookback period (LAPI format: `24h`, `7d`, etc.) |
| `limit` | `100` | Max results per page |
| `page` | `1` | Page number (client-side, applied after fetch) |
| `ip` | — | Filter by source IP (passed to LAPI as `ip`) |
| `scenario` | — | Filter by scenario name |

Response:
```json
{
  "alerts": [...],
  "total": 42,
  "page": 1,
  "page_size": 100
}
```

Each alert object is the raw LAPI alert shape, passed through without transformation.

#### Alert Detail

```
GET /api/alerts/:id
```

Proxies to LAPI `GET /v1/alerts/:id`. Returns full alert object including `meta` context entries.

#### Decisions

```
GET /api/decisions?active_only=true&limit=100&page=1&ip=1.2.3.4
```

Proxies to LAPI `GET /v1/decisions`. Returns a paginated list of decisions.

Query parameters:

| Param | Default | Description |
|---|---|---|
| `active_only` | `true` | When `true`, omits expired decisions |
| `limit` | `100` | Max results per page |
| `page` | `1` | Page number |
| `ip` | — | Filter by IP value |

Response:
```json
{
  "decisions": [...],
  "total": 17,
  "page": 1,
  "page_size": 100
}
```

#### Ban IP

```
POST /api/decisions
Body: {
  "ip": "1.2.3.4",
  "duration": "4h",
  "reason": "manual ban",
  "type": "ban"
}
```

Creates a decision via LAPI `POST /v1/alerts` using the same alert+decision payload structure as `cscli decisions add`.

`type` accepts `ban` or `captcha`. `duration` accepts Go duration strings: `1h`, `24h`, `7d`, etc.

Response: `{ "ok": true }` or `{ "error": "..." }`.

#### Unban IP (by decision ID)

```
DELETE /api/decisions/:id
```

Proxies to LAPI `DELETE /v1/decisions/:id`.

Response: `{ "ok": true }` or `{ "error": "..." }`.

---

## Frontend (React SPA)

Single-page app served as static files embedded in the Go binary.
React Router with two routes:

| Route | Page |
|---|---|
| `/` | Alerts |
| `/decisions` | Active Decisions |

### Alerts Page

- Table of alerts from `GET /api/alerts`
- Columns: `Date`, `IP`, `Country`, `Scenario`, `Decision`, `Actions`
- Filter bar: IP input, Scenario input, Since selector (`1h / 6h / 24h / 7d`)
- Clicking a row opens an Alert Detail panel (slide-over or expand-in-place)
- Alert Detail shows: all alert fields + raw `meta` context entries
- "Ban IP" button on each row — opens Ban modal pre-filled with that IP
- Pagination controls

### Decisions Page

- Table of active decisions from `GET /api/decisions`
- Columns: `Date`, `IP`, `Type`, `Duration`, `Reason`, `Origin`, `Actions`
- Filter bar: IP input
- "Unban" button per row — calls `DELETE /api/decisions/:id`, refreshes list
- "Ban IP" button in page header — opens Ban modal
- Pagination controls

### Ban Modal

- Fields: IP address, Duration (`1h / 4h / 24h / 72h / custom`), Reason, Type (`ban / captcha`)
- Validation: IP format check before submit
- On success: closes modal, refreshes current page data

### Status Bar

- Shown at top of every page
- Displays: LAPI connection status (green/red dot) from `GET /api/health`
- Refreshed every 60 seconds

---

## Docker

### Dockerfile

Multi-stage build:

1. **Stage `web-builder`** — `node:22-alpine`
   - Installs dependencies with `npm ci`
   - Runs `vite build` → outputs to `web/dist/`

2. **Stage `go-builder`** — `golang:1.24-alpine`
   - Copies `web/dist/` from previous stage
   - `go build` with `CGO_ENABLED=0` → single static binary

3. **Stage `runner`** — `gcr.io/distroless/static-debian12`
   - Copies the binary only
   - `EXPOSE 3000`
   - `CMD ["/server"]`

### docker-compose.yml

```yaml
services:
  crowdsec-lite-ui:
    image: crowdsec-lite-ui:latest
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      LAPI_URL: http://crowdsec:8080
      LAPI_USERNAME: crowdsec-web-ui
      LAPI_PASSWORD: your-password-here
    networks:
      - crowdsec-net

networks:
  crowdsec-net:
    external: true
```

---

## LAPI Client (Go)

The LAPI client (`internal/lapi/client.go`) handles:

- Login via `POST /v1/watchers/login` — stores JWT in memory
- Automatic re-auth on `401` (one retry per request)
- Request timeout: 30s default
- All methods are synchronous (no goroutine pools, no caching)
- TLS support via optional `InsecureSkipVerify`

```go
type Client struct {
    baseURL    string
    username   string
    password   string
    token      string
    httpClient *http.Client
    mu         sync.Mutex // protects token during re-auth
}

func (c *Client) FetchAlerts(since, ip, scenario string) ([]Alert, error)
func (c *Client) FetchAlertByID(id string) (*Alert, error)
func (c *Client) FetchDecisions(activeOnly bool, ip string) ([]Decision, error)
func (c *Client) AddDecision(ip, duration, reason, decType string) error
func (c *Client) DeleteDecision(id string) error
func (c *Client) Heartbeat() error
```

---

## Data Types

Passed through from LAPI as-is. Minimal Go structs for JSON unmarshalling:

```go
type Alert struct {
    ID           int64       `json:"id"`
    Scenario     string      `json:"scenario"`
    Message      string      `json:"message"`
    StartAt      string      `json:"start_at"`
    StopAt       string      `json:"stop_at"`
    Simulated    bool        `json:"simulated"`
    Source       Source      `json:"source"`
    Decisions    []Decision  `json:"decisions"`
    Meta         []MetaItem  `json:"meta"`
    EventsCount  int         `json:"events_count"`
}

type Source struct {
    Scope     string  `json:"scope"`
    Value     string  `json:"value"`
    IP        string  `json:"ip"`
    Range     string  `json:"range"`
    AsNumber  string  `json:"as_number"`
    AsName    string  `json:"as_name"`
    Cn        string  `json:"cn"`
    Latitude  float64 `json:"latitude"`
    Longitude float64 `json:"longitude"`
}

type Decision struct {
    ID       int64  `json:"id"`
    Origin   string `json:"origin"`
    Type     string `json:"type"`
    Scope    string `json:"scope"`
    Value    string `json:"value"`
    Duration string `json:"duration"`
    Scenario string `json:"scenario"`
    Simulated bool  `json:"simulated"`
}

type MetaItem struct {
    Key   string `json:"key"`
    Value string `json:"value"`
}
```

---

## Error Handling

- All API errors return JSON: `{ "error": "description" }`
- LAPI connectivity errors: `502` with `{ "error": "LAPI unavailable: ..." }`
- Invalid input (bad IP, missing fields): `400` with `{ "error": "..." }`
- Not found: `404`
- LAPI re-auth failure: `502`

---

## Out of Scope (explicit)

These are intentionally excluded and must not be added:

- Local SQLite or any file-based storage
- Background goroutines / timers (except the HTTP server itself)
- WebSocket / SSE
- GeoNames / geolocation data
- Notification system
- Multi-instance / multi-LAPI support
- User accounts / sessions / auth
- Dashboard statistics / charts
- Alert deletion / cleanup queue
- Simulation mode toggle
