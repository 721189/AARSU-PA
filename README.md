# Aarsu — J.A.R.V.I.S. Command Core

A holographic 3D assistant interface with a Gemini-powered conversational core.

> **This README describes what the code actually does today.** The previous version
> advertised systems that did not exist (PostgreSQL, Redis, an immutable knowledge
> graph, a real MCP hub, automated backups). If you are looking for the gap between
> this app and a real J.A.R.V.I.S., read
> [`docs/JARVIS_AUDIT.md`](docs/JARVIS_AUDIT.md) and the roadmap in
> [`docs/JARVIS_BUILD_PLAN.md`](docs/JARVIS_BUILD_PLAN.md).

---

## What this is

A single-page React 19 + Vite app with an Express backend. It layers a JARVIS-style
HUD (3D arc reactor, holographic panels, lip-sync visemes, telemetry) over a Gemini
chat bot with Google Search/Maps grounding, code execution, and read access to
Google Workspace.

## Status at a glance

| Area | State |
|---|---|
| Build, type-check, tests | ✅ green — `npm run lint`, `npm test` (325 tests), `npm run build` |
| Gemini chat, grounding, code execution | ✅ real |
| **Voice** | ✅ **Gemini TTS (`gemini-3.8-flash-tts`) streamed sentence-by-sentence; Live API ephemeral tokens; real wake word at utterance start; instant barge-in** |
| **Agency** | ✅ **native function calling with a real tool loop and a confirmation gate for anything that changes state** |
| **Memory** | ✅ **server-side embeddings + ranking, structured user profile, episodic recall; Firestore-backed when configured, otherwise an explicitly non-durable store** |
| **Perception** | ✅ **real camera (`getUserMedia`) and screen (`getDisplayMedia`) capture, with a kill switch** |
| **Proactivity** | ✅ **relevance-scored alerts over real host telemetry, with quiet hours, focus mode and de-duplication** |
| **MCP** | ✅ **a real Model Context Protocol server (JSON-RPC 2.0, `initialize`, `tools/*`, `resources/*`)** |
| **Workspace auth** | ✅ **OAuth authorisation-code flow; refresh tokens stay server-side and never reach the browser** |
| **Devices** | ✅ **Home Assistant adapter when configured; the simulated facility is flagged `simulated: true` everywhere** |
| **Deploy** | ✅ **multi-stage Dockerfile, CSP, CORS allow-list, split rate limits, readiness probe, graceful shutdown, installable PWA** |
| Biometrics, arc-reactor power gauge, "reinforcement learning" | ⚠️ still **simulated** — see [`docs/JARVIS_AUDIT.md`](docs/JARVIS_AUDIT.md) |

Everything above was implemented and verified in this repo; see
[`docs/JARVIS_BUILD_PLAN.md`](docs/JARVIS_BUILD_PLAN.md) for the phase-by-phase record and for
what still needs live credentials to exercise end to end.

## Architecture

```
Browser (React 19 SPA)
  App.tsx ─ AarsuAvatar (portrait + visemes) · JarvisHud (3D core, 10 tabs)
  ChatInterface.tsx ─ chat, voice presets, VisionManager (real webcam)
  lib/ ─ firebase (auth + 401 retry), memory (embeddings), audioEngine, duplexVoice

Express server.ts
  Gemini proxy   /api/chat /api/embed /api/jarvis/{search,code,maps,swarm,vision/analyze,...}
  Workspace      /api/proactive
  In-memory      redisCache, dbService, iotBridge, knowledgeGraph, predictiveDaemon
```

## Quick start

```bash
git clone https://github.com/721189/AARSU-PA.git
cd AARSU-PA
npm install
cp .env.example .env        # then set GEMINI_API_KEY
npm run dev                 # http://localhost:3000
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | All Gemini calls |
| `PORT` | no | Defaults to `3000` |
| `APP_URL` | no | Self-origin, used for the CORS allow-list |
| `CORS_ORIGINS` | no | Comma-separated extra allowed origins |
| `TRUST_PROXY_HOPS` | no | Proxy hop count for `X-Forwarded-For` (default `1`) |
| `JARVIS_PERSONA` | no | `jarvis` (default) or `aarsu` |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` / `OAUTH_REDIRECT_URI` | no | Enables Google Workspace connect |
| `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` | no | Enables real device control |
| `VITE_OAUTH_CLIENT_ID` | no | Falls back to `firebase-applet-config.json` |

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with Vite middleware |
| `npm run build` | Build the SPA and bundle the server to `dist/server.cjs` |
| `npm start` | Run the production bundle |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | Unit + API contract tests (Vitest) |

## Health

`GET /api/health` reports per-dependency status rather than a bare `"ok"`, and
returns **503** when something is down:

```json
{
  "status": "ok",
  "checks": {
    "gemini":        { "status": "ok", "detail": "chat=gemini-3.8-flash" },
    "firebaseAdmin": { "status": "ok" },
    "cache":         { "status": "ok", "detail": "0 keys" }
  },
  "uptimeSeconds": 12
}
```

## API

All routes except `/api/health` require `Authorization: Bearer <firebase-id-token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Per-dependency health (no auth) |
| `GET` | `/api/ready` | Readiness probe (no auth) |
| `POST` | `/api/chat` | Conversational reply with emotion tag |
| `POST` | `/api/embed` | Text embedding (`gemini-embedding-001`) |
| **`GET`** | **`/api/voice/voices`** | **Available Gemini TTS voices + active persona** |
| **`POST`** | **`/api/voice/tts`** | **One-shot synthesis → playable WAV** |
| **`POST`** | **`/api/voice/tts/stream`** | **Streaming synthesis (SSE, raw PCM)** |
| **`POST`** | **`/api/voice/converse/stream`** | **Text *and* speech in one streamed turn** |
| **`POST`** | **`/api/voice/live-token`** | **Ephemeral Live API token (single-use)** |
| **`GET`** | **`/api/agent/tools`** | **Registered tools + which need confirmation** |
| **`POST`** | **`/api/agent/act`** | **Run an objective through the tool loop** |
| **`GET`/`POST`** | **`/api/memory/*`** | **remember / recall / profile / episodes** |
| **`POST`** | **`/api/mcp`** | **Real MCP endpoint (JSON-RPC 2.0)** |
| **`GET`/`POST`/`DELETE`** | **`/api/workspace/*`** | **Connect / status / disconnect Workspace** |
| `POST` | `/api/proactive` | Calendar/Drive/Gmail proactive suggestions |
| `POST` | `/api/jarvis/search` | Google Search grounding with citations |
| `POST` | `/api/jarvis/maps` | Google Maps grounding |
| `POST` | `/api/jarvis/code` | Sandboxed code execution |
| `POST` | `/api/jarvis/swarm` | Iron Legion multi-agent sweep |
| `POST` | `/api/jarvis/vision/analyze` | Multimodal image analysis |
| `POST` | `/api/jarvis/generate-3d-image` | Image generation |
| `POST` | `/api/agent/run` | Structured autonomous task run |
| `GET` | `/api/jarvis/graph` | Associative knowledge graph (in-memory) |
| `GET`/`POST` | `/api/jarvis/iot/*` | Devices (Home Assistant or simulated) |
| `GET`/`POST` | `/api/jarvis/biometrics` | Simulated biometric telemetry |
| `GET`/`POST`/`DELETE`/`PUT` | `/api/jarvis/proactive/*` | Alert feed, tick, interruption policy |
| `GET` | `/api/jarvis/host/diagnostics` | Real host OS telemetry |
| `GET` | `/api/mcp/tools`, `/api/mcp/resources` | REST adapter for the in-app inspector |

## Models

All model IDs live in [`src/server/models.ts`](src/server/models.ts) — the single
source of truth. Do not inline model IDs.

| Purpose | Model |
|---|---|
| Chat | `gemini-3.8-flash` (fallbacks: `gemini-3.6-flash`, `gemini-3.5-flash`) |
| Fast tier / sub-agents | `gemini-3.6-flash` |
| Embeddings | `gemini-embedding-001` |
| Image generation | `imagen-4.0-generate-001` |

## Security notes

- Google Workspace credentials are held **server-side** (authorisation-code flow);
  no Google access token is ever sent to or from the browser.
- CORS is an explicit allow-list derived from `APP_URL` / `CORS_ORIGINS`. With neither
  set in production, cross-origin browser requests are refused.
- CSP is enabled in production (`script-src 'self'`, `frame-ancestors 'none'`,
  `connect-src` limited to self plus the Gemini endpoints).
- Rate limits are split by cost: 600/15 min general, 80/15 min on AI routes, 240/min on
  read-only telemetry.
- Destructive tools require explicit confirmation and **cannot be reached over MCP**,
  because an external client cannot satisfy the interactive gate.
- Filesystem tools are sandboxed to the workspace root; traversal and
  prefix-sibling escapes are rejected.

## Deployment

```bash
docker build -t aarsu-jarvis .
docker run -p 3000:3000 -e GEMINI_API_KEY=... -e APP_URL=https://your-host aarsu-jarvis
```

The image runs as a non-root user and ships a `HEALTHCHECK` against `/api/health`.
`/api/ready` is the readiness probe; `/api/health` reports per-dependency status
(including whether the memory backend is durable) and returns 503 when something is down.

## Testing

```bash
npm test          # 34 tests: model registry, error mapping, API contract
npm run lint      # type-check
```

`tests/api.contract.test.ts` boots the real Express app on an ephemeral port and
asserts auth gating and honest status codes across 17 protected routes.

CI is defined in [`docs/ci.github-actions.yml`](docs/ci.github-actions.yml); move it to
`.github/workflows/ci.yml` to activate it (the automation identity used for the initial
commit lacked `workflows` permission).

## Roadmap

See [`docs/JARVIS_BUILD_PLAN.md`](docs/JARVIS_BUILD_PLAN.md). Phase 0 (stabilise and
tell the truth) is complete.

## License

MIT.
