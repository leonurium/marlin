# Marlin 🐟

REST API wrapper for [Projects.co.id](https://projects.co.id) — automate deposits, check status, and confirm payments via a clean HTTP API.

> Built for freelancers who want to script their Projects.co.id wallet flow.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/connect` | Login with Projects.co.id credentials |
| `POST` | `/api/deposit` | Create a deposit (requires session) |
| `POST` | `/api/deposit/confirm` | Confirm payment for a track code |
| `GET`  | `/api/deposit/:trackCode` | Get deposit order status |

### `POST /api/auth/connect`

```json
{ "username": "myuser", "password": "mypass" }
→ { "session_id": "uuid", "message": "Logged in as myuser" }
```

### `POST /api/deposit`

```json
{ "session_id": "uuid", "amount": 50000 }
→ {
    "track_code": "a8f915",
    "amount_to_transfer": "Rp 50,438",
    "unique_code": "438",
    "deadline": "3x24 hours",
    "banks": [
      { "bank": "BCA", "account": "4373037667", "name": "PANONPOE MEDIA PT" },
      { "bank": "Mandiri", "account": "1310011570639", "name": "PANONPOE MEDIA" },
      { "bank": "BNI", "account": "0345700851", "name": "PANONPOE MEDIA" }
    ]
  }
```

### `POST /api/deposit/confirm`

```json
{ "session_id": "uuid", "track_code": "a8f915" }
→ { "status": "Processing Payment", "message": "Payment confirmed." }
```

### `GET /api/deposit/:trackCode?session_id=uuid`

```json
→ { "status": "Waiting Payment", "amount": "Rp 50,000", "total_pay": "Rp 50,438", "date": "12/06/2026 20:20:52 WIB" }
```

## Quick Start

```bash
npm install
cp .env.example .env
# Set CHROMIUM_PATH to your local CloakBrowser binary, then:
npm start
```

Server listens on `http://localhost:3100`.

**Local CloakBrowser** (recommended for development):

```bash
BROWSER_MODE=local
CHROMIUM_PATH=/path/to/cloakbrowser/chromium-*/chrome
```

## Browser Modes

| Mode | When to use | Required env |
|------|-------------|--------------|
| **local** | Dev machine with CloakBrowser installed | `CHROMIUM_PATH` (optional) |
| **cdp** | Shared `cloakserve` on Docker/Koyeb | `CDP_URL` |
| **manager** | [CloakBrowser Manager](https://github.com/CloakHQ/CloakBrowser-Manager) | `MANAGER_URL` |
| **auto** | `MANAGER_URL` → `CDP_URL` → local | — |

```bash
# Remote CDP (cloakserve)
BROWSER_MODE=cdp
CDP_URL=https://your-cloakbrowser.example.com

# Manager (profile per session)
BROWSER_MODE=manager
MANAGER_URL=http://localhost:8080
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `BROWSER_MODE` | `auto` | `auto`, `local`, `cdp`, or `manager` |
| `MANAGER_URL` | — | CloakBrowser Manager base URL |
| `MANAGER_AUTH_TOKEN` | — | Bearer token when Manager `AUTH_TOKEN` is set |
| `MANAGER_PROXY` | — | Residential proxy URL for Manager profiles (`http://user:pass@host:port`) |
| `MANAGER_GEOIP` | `true` if proxy set | Match timezone/locale to proxy exit IP |
| `MANAGER_HEADLESS` | `true` | Set `false` for headed mode |
| `CHROMIUM_PATH` | auto | Local CloakBrowser Chromium binary |
| `CDP_URL` | — | Remote `cloakserve` URL |
| `SESSION_TTL_MS` | `1800000` (30 min) | Session idle timeout |

## How It Works

Marlin uses **Playwright** with **CloakBrowser** to automate Projects.co.id:

1. **Auth** — logs in, keeps cookies in a Playwright context
2. **Deposit** — submits deposit form → extracts payment instructions
3. **Confirm** — clicks Confirm Payment when status is `Waiting Payment`

Each `session_id` maps to an isolated browser context. Sessions expire after 30 minutes of inactivity.

## License

MIT
