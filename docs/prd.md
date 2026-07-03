# Marlin — PRD

## 1. Concept & Vision

Marlin is a stateless REST API wrapper for [Projects.co.id](https://projects.co.id) that lets developers and freelancers script their wallet deposit flow programmatically. Instead of clicking through the web UI manually, users call simple HTTP endpoints: login → deposit → confirm.

**Personality:** Practical and focused. No magic — just clean HTTP wrappers around a browser-automated flow. Reliable error messages. Transparent about what's happening under the hood.

## 2. Design Language

**Aesthetic:** API-first, no UI. Open-source dev tooling aesthetic.

**Colors:** N/A (no frontend).

**Typography:** N/A.

**API Design Principles:**
- All auth via `session_id` in request body or `?session_id=` query param
- Consistent JSON envelope: `{ data }` on success, `{ error: "..." }` on failure
- HTTP status codes: 200 = ok, 400 = bad input, 401 = no/invalid session, 500 = internal error
- Sessions are server-side (in-memory Map), keyed by UUID, auto-expire after 30 min idle

## 3. Layout & Structure

```
marlin/
├── src/
│   ├── index.ts          # Express app bootstrap
│   ├── lib/
│   │   ├── browser.ts    # Playwright singleton
│   │   └── sessions.ts   # In-memory session store
│   ├── services/
│   │   ├── auth.ts      # Login logic
│   │   └── deposit.ts   # Deposit + confirm + status logic
│   └── routes/
│       ├── auth.ts       # /api/auth/*
│       └── deposit.ts    # /api/deposit/*
├── openspec/
│   └── prd.md
├── package.json
├── tsconfig.json
├── README.md
└── .env.example
```

## 4. Features & Interactions

### Endpoints

| Method | Path | Auth | Params |
|--------|------|------|--------|
| `POST` | `/api/auth/connect` | No | `{username, password}` |
| `DELETE` | `/api/auth/disconnect` | `x-session-id` header | — |
| `GET` | `/api/auth/sessions` | No | — |
| `POST` | `/api/deposit` | `session_id` | `{session_id, amount}` |
| `POST` | `/api/deposit/confirm` | `session_id` | `{session_id, track_code}` |
| `GET` | `/api/deposit/:trackCode` | `session_id` query | `?session_id=` |

### `POST /api/auth/connect`
1. Launch Playwright browser (singleton, shared)
2. Create new browser context
3. Navigate to Projects.co.id login page
4. Fill credentials, submit
5. Save session to in-memory Map with UUID key
6. Return `{ session_id, message }`

### `POST /api/deposit`
1. Validate `amount >= 50000`
2. Load session from Map
3. Empty cart → fill deposit form → submit → cart → Bank Transfer tab → extract payment details
4. Return `{ track_code, amount_to_transfer, unique_code, deadline, banks }`

### `POST /api/deposit/confirm`
1. Load session
2. Check order status via `my_orders/view/:trackCode`
3. If `Waiting Payment` → navigate to `confirm_payment/:trackCode` → JS click submit
4. Return `{ status, message }`

### `GET /api/deposit/:trackCode`
1. Load session
2. Navigate to `my_orders/view/:trackCode`
3. Parse and return status fields

### Error Handling
- Missing/invalid session → 401
- Amount < 50000 → 400
- Playwright navigation timeout → 500 with error message
- Session expired mid-flow → 401

## 5. Component Inventory

### Session Store (`sessions.ts`)
- In-memory Map<UUID, { context, username, lastAccess }>
- TTL: 30 min idle (configurable via `SESSION_TTL_MS`)
- Cleanup interval: every 5 min

### Browser Singleton (`browser.ts`)
- Single Playwright Chromium instance
- Launched once on first request
- Shared across all sessions (contexts are isolated per session)
- CloakBrowser path configurable via `CHROMIUM_PATH` env

### Deposit Flow (`deposit.ts`)
- `createDeposit()`: form → cart → bank transfer → extract
- `getOrderStatus()`: navigate → parse status page
- `confirmDeposit()`: status check → confirm page → submit

## 6. Technical Approach

**Runtime:** Node.js 20+, ESM, TypeScript 5.6
**Framework:** Express 4
**Automation:** Playwright 1.52 with CloakBrowser stealth Chromium
**Dependencies:** `uuid`, `cors`, `dotenv`, `express-rate-limit`

**Session Model:** Server-side, in-memory. Each `session_id` maps to an isolated Playwright BrowserContext with its own cookies. Sessions expire after 30 min of inactivity.

**Rate Limiting:** 30 requests/min per IP on all `/api/` routes.

**Environment Variables:**
- `PORT` — server port (default 3100)
- `CHROMIUM_PATH` — path to Chromium executable
- `SESSION_TTL_MS` — session idle timeout (default 1800000 = 30 min)

**Not in scope:** User-facing UI, persistent storage, multi-user auth, webhook callbacks.
