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
| Build, type-check, tests | ✅ green (`npm run lint`, `npm test`, `npm run build`) |
| Gemini chat, grounding, code execution | ✅ real |
| Google Workspace (Calendar/Drive/Gmail) | ✅ real, via a client-supplied OAuth token (see Security) |
| 3D HUD, WebAudio cues, webcam vision for chat | ✅ real |
| Voice input/output | ⚠️ browser `speechSynthesis` / `webkitSpeechRecognition` — not the Gemini Live API |
| Wake word | ⚠️ substring match on the transcript, not a wake-word engine |
| IoT devices, biometrics, D3 telemetry chart, knowledge graph, "reinforcement learning" | ⚠️ **simulated** — in-process mock data, labelled as such in the UI where possible |
| MCP hub | ⚠️ a REST façade shaped like MCP; not the Model Context Protocol |
| Multi-agent "Iron Legion" | ⚠️ three parallel Gemini prompts with a real retry, no planner/verifier |
| Proactive daemon | ⚠️ interval loop over mock telemetry |

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
| `APP_URL` | no | Self-referential links / OAuth callbacks |
| `VITE_OAUTH_CLIENT_ID` | no | Google Workspace OAuth (falls back to `firebase-applet-config.json`) |

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
| `POST` | `/api/chat` | Conversational reply with emotion tag |
| `POST` | `/api/embed` | Text embedding (`gemini-embedding-001`) |
| `POST` | `/api/proactive` | Calendar/Drive/Gmail proactive suggestions |
| `POST` | `/api/jarvis/search` | Google Search grounding with citations |
| `POST` | `/api/jarvis/maps` | Google Maps grounding |
| `POST` | `/api/jarvis/code` | Sandboxed code execution |
| `POST` | `/api/jarvis/swarm` | Iron Legion multi-agent sweep |
| `POST` | `/api/jarvis/vision/analyze` | Multimodal image analysis |
| `POST` | `/api/jarvis/generate-3d-image` | Image generation |
| `POST` | `/api/agent/run` | Structured autonomous task run |
| `GET` | `/api/jarvis/graph` | Associative knowledge graph (in-memory) |
| `GET`/`POST` | `/api/jarvis/iot/*` | Simulated facility devices |
| `GET`/`POST` | `/api/jarvis/biometrics` | Simulated biometric telemetry |
| `GET` | `/api/jarvis/host/diagnostics` | Real host OS telemetry |
| `GET`/`POST` | `/api/mcp/*` | MCP-shaped tool + resource façade |

## Models

All model IDs live in [`src/server/models.ts`](src/server/models.ts) — the single
source of truth. Do not inline model IDs.

| Purpose | Model |
|---|---|
| Chat | `gemini-3.8-flash` (fallbacks: `gemini-3.6-flash`, `gemini-3.5-flash`) |
| Fast tier / sub-agents | `gemini-3.6-flash` |
| Embeddings | `gemini-embedding-001` |
| Image generation | `imagen-4.0-generate-001` |

## Security notes (known gaps)

- The Google Workspace OAuth access token is currently sent in the request **body**
  for `/api/chat` and `/api/proactive`. Moving this server-side is Phase 6 of the plan.
- CORS is currently unrestricted and CSP is disabled for local Vite HMR.
- `firebase-applet-config.json` contains client-side Firebase credentials (expected to
  be public for a web app, but they should be injected via env rather than committed).

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
