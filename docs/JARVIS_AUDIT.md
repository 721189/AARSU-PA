# J.A.R.V.I.S. Readiness Audit — `721189/AARSU-PA`

| | |
|---|---|
| **Repository** | `https://github.com/721189/AARSU-PA` |
| **Audited commit** | `4051581` — *"feat(ui): add D3.js systems diagnostic component"* (branch `main`) |
| **Audit branch** | `cline/028k86jn` |
| **Audit date** | 2026-10-13 |
| **Goal stated by owner** | *"I want this software exactly like the software of JARVIS of Iron Man."* |
| **Code size** | 7,089 LOC across 29 TS/TSX/CSS files (`server.ts` 918, `ChatInterface.tsx` 1,049, `JarvisHud.tsx` 1,108) |

---

## 0. Verdict in one paragraph

This is a **visually impressive, single-user demo of a JARVIS *theme***, not a JARVIS *system*. The front end is genuinely good work: a 3D arc-reactor core, a holographic HUD, lip-sync visemes, micro-expressions, a D3 telemetry chart, and 26 API endpoints wired end-to-end. It **builds clean and boots successfully** (verified below). However, the overwhelming majority of the "enterprise cognitive" behaviour is **cosmetic or simulated**: biometrics are `Math.random()`, the D3 diagnostics chart plots invented numbers, IoT "blast doors" are a seeded in-memory `Map`, the "MCP server" is a REST façade rather than the Model Context Protocol, the "reinforcement learning" is a two-line Q-weight nudge, and vision analysis in the HUD literally draws a fake canvas instead of reading the camera. Most importantly, **the parts that would make it feel like JARVIS — real-time streaming voice, a wake word, agentic tool execution, and persistent memory — are either missing or built on the browser's robotic `speechSynthesis`/`webkitSpeechRecognition` instead of the Gemini Live API and Gemini TTS that exist today.** Three model IDs in active use are **already shut down**, and there is a **hard persona conflict** (a soft-spoken female companion named "Aarsu" in the chat core vs. the British "Sir"-addressing JARVIS everywhere else). Verdict: **~20% of a real JARVIS, wrapped in ~90% of the presentation layer.** The plan in `docs/JARVIS_BUILD_PLAN.md` closes that gap.

---

## 1. What the repo actually is

A Google AI Studio–generated, single-page React 19 + Vite + Express app that layers a JARVIS *skin* over a Gemini chat bot.

- **Front end:** React 19, TypeScript, Vite 6, Tailwind 4, `three` (3D core + CAD viewer), `d3` (telemetry chart), `motion`, `lucide-react`.
- **Back end:** a single 918-line `server.ts` Express app that (a) proxies Gemini, (b) proxies Google Workspace (Calendar/Drive/Gmail/Docs) with a client-supplied OAuth access token, and (c) hosts ~10 in-memory "enterprise" singletons (fake Redis, fake DB, fake IoT bridge, fake knowledge graph, fake daemons).
- **Auth:** Firebase Auth (client) + `firebase-admin` ID-token verification (server).
- **Persistence:** Firestore for chat "memories" only; everything else is process memory and dies on restart.
- **Deployment:** none. No Dockerfile, no CI, no IaC. `npm run build` + `npm start` only.

The name is split: the repo/metadata/package say **"Aarsu"**; the UI chrome says **"J.A.R.V.I.S."**; the chat persona is Aarsu. See §9.

---

## 2. Verified build & runtime status (evidence)

All commands run on the audited commit in a clean checkout (`node v24.15.0`), after `npm install` (559 packages).

| Check | Command | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | ✅ **0 errors** |
| Front-end build | `vite build` | ✅ built in 3.73 s |
| Server build | `esbuild server.ts --bundle` | ✅ `dist/server.cjs` 68.3 kB |
| Bundle size | — | ⚠️ `index.js` **1,596 kB (420 kB gzip)** — single un-split chunk; Vite warns |
| Server boot | `NODE_ENV=production node dist/server.cjs` | ✅ `running on http://0.0.0.0:3000` |
| Health | `GET /api/health` | ✅ `{"status":"ok",...}` |
| Auth gate | `POST /api/chat` (no token) | ✅ `401` (correct) |
| SPA serve | `GET /` | ✅ `200` |
| Tests | — | ❌ **none exist** (see §8.3) |
| Lockfile | `npm ci` vs `package.json` | ⚠️ **out of sync** — `d3` and `@types/d3` are in `package.json` but missing from `package-lock.json` |

**So the baseline is not "broken" — it is a working demo.** The problem is what the demo *claims* to be.

---

## 3. As-built architecture

```
Browser (React 19 SPA)
├── App.tsx ── header, split "stage | command dock" layout, global speechSynthesis
├── AarsuAvatar.tsx ── portrait + parallax + blink + HumanLipSync + MicroExpressionOverlay
├── JarvisHud.tsx (1,108 L) ── 3D core, radar dial, 10 tabs (intel/compute/swarm/vault/
│                              systems/vision/iot/cad/host/mcp), duplex mic meter
│   ├── Jarvis3DCore.tsx      three.js icosahedron + tori + particles
│   ├── JarvisHoloCad.tsx     three.js "helmet" wireframe + explode slider
│   ├── JarvisSystemsDiagnostic.tsx  d3 line chart (SIMULATED data)
│   └── JarvisMcpInspector.tsx       REST tool/resource browser
├── ChatInterface.tsx (1,049 L) ── chat, soft-girl voice presets, VisionManager, JARVIS modal
│   └── VisionManager.tsx    real getUserMedia webcam capture
└── lib/: firebase.ts (auth+retry), memory.ts (embeddings+cosine), knowledgeGraph.ts,
        audioEngine.ts (WebAudio chirps), duplexVoice.ts (barge-in RMS), voiceHotkeyEngine.ts

Express server.ts (918 L, 26 routes; all but /api/health behind requireAuth)
├── Gemini proxy: /api/chat, /api/embed, /api/jarvis/{search,code,maps,swarm,vision/analyze,
│                 generate-3d-image,agent/run}
├── Workspace proxy: /api/proactive (Calendar/Drive/Gmail)
└── "Enterprise" singletons (all in-process, all lost on restart):
    redisCache.ts      Map + EventEmitter dressed as Redis
    dbService.ts       Firestore-or-Map telemetry + hardcoded biometrics
    iotBridge.ts       4 seeded fake devices
    knowledgeGraph.ts  5 hardcoded Stark nodes
    predictiveDaemon.ts 25 s setInterval emitting canned alerts
    reinforcementScheduler.ts  hand-rolled Q-table + seeded "suggestions"
    mcpServer.ts       REST façade over the above
    backup.ts          node-cron job whose body is comments
    auth.ts            firebase-admin verifyIdToken + unused requireRole
```

**Front-end → back-end contract is consistent:** every `/api/...` path referenced in `src/` exists in `server.ts` (29 distinct paths cross-listed, 0 missing).

---

## 4. Feature inventory — Real vs. Simulated vs. Broken

Legend: 🟢 real · 🟡 simulated/mocked · 🔴 broken/shut-down · ⚪ missing

| Claimed capability | Reality | Verdict |
|---|---|---|
| Gemini chat with emotion tagging | Real calls, JSON-mode, model fallback chain | 🟢 |
| Google Search grounding (`/api/jarvis/search`) | Real `googleSearch` tool + citation extraction | 🟢 |
| Code execution (`/api/jarvis/code`) | Real `codeExecution` tool | 🟢 |
| Google Maps grounding | Real `googleMaps` tool | 🟢 |
| Google Workspace (Calendar/Drive/Gmail) | Real `googleapis` calls | 🟢 (but see §7.2) |
| Webcam vision for chat | Real `getUserMedia` + snapshot → Gemini | 🟢 |
| Firebase auth + 401 retry | Real, well-implemented (`authenticatedFetch`) | 🟢 |
| WebAudio HUD chirps / arc pulse | Real WebAudio synthesis | 🟢 |
| Barge-in / duplex interruption | Real RMS threshold on mic | 🟢 (crude — see plan) |
| Wake word | **Substring match** on the STT transcript (`includes('jarvis')`) — not a real wake-word engine, and it *also* fires on "aarsu" mid-sentence | 🟡 |
| Voice output | Browser `speechSynthesis` + pitch/rate hacks + "find best female voice" heuristics | 🟡 |
| Speech input | `webkitSpeechRecognition` only (Chrome-family; no Firefox/Safari fallback) | 🟡 |
| 3D arc-reactor core | Real three.js, animated by `isSpeaking` | 🟢 |
| Holo-CAD suit viewer | Real three.js wireframe, but **the explode slider is cosmetic** (never applied to geometry) | 🟡 |
| Systems diagnostic chart | **`Math.random()`** data + a manual "anomaly mode" toggle | 🟡 |
| Biometric telemetry | Hardcoded `{74, 18, 94, 36.8}` + random walk in the UI; "stress spike" button POSTs fiction | 🟡 |
| IoT / "blast doors" / HVAC | 4 devices in a `Map`; no hardware protocol at all | 🟡 |
| Knowledge graph (Graph-RAG) | 5 hardcoded nodes + in-memory `Map`; `queryAssociations` BFS is real | 🟡 |
| "Redis" cache | `Map` + `EventEmitter`; metrics are real but there is no Redis | 🟡 |
| "Reinforcement learning" | `Q += α(reward − Q)` on 4 category weights; no episodes/state/policy | 🟡 |
| Proactive daemon | `setInterval` emitting canned strings; only the stress>65 branch is data-driven | 🟡 |
| MCP hub | **Not MCP.** No JSON-RPC, no `initialize`/`tools/list` handshake, no stdio/SSE transport, no protocol-version negotiation. It is a REST API *shaped like* MCP | 🟡 |
| Vision analysis in HUD | **Draws a fake canvas** ("TARGET ACQUIRED") and sends *that* to Gemini — never reads the camera | 🔴 |
| Image generation | Uses `imagen-3.0-generate-002` → **shut down 2025-11-10**; silently returns an Unsplash stock URL on failure | 🔴 |
| Embeddings | Uses `text-embedding-004` → **no longer a documented model**; silently degrades to lexical search | 🔴 |
| Iron Legion sub-agents | 3 parallel Gemini prompts + a hardcoded "self-healing" flag; `gemini-3.1-flash-lite` → **shut down** | 🔴 |
| Automated backups | Cron job body is **only comments** | 🔴 |
| RBAC (`requireRole`) | Defined, never mounted; `req.userRole` is hardcoded `'user'` | 🔴 |
| Persistent conversation memory | Firestore memories + client-side cosine over 50 docs | 🟡 (does not scale) |
| Wake-on-hotkey (Ctrl+Space) | Real `keydown` listener | 🟢 |
| Local file / OS control | Read-only workspace metadata + `os.*` diagnostics | 🟡 |
| Always-on / multi-device / background | None | ⚪ |
| Streaming responses | None — every endpoint returns a full JSON body | ⚪ |
| Real wake/sleep, device handoff, HUD projection | None | ⚪ |

---

## 5. Gap analysis vs. the film JARVIS

What actually makes JARVIS *feel* like JARVIS (ranked by perceptual impact), and where this repo stands:

| # | JARVIS behaviour (film canon) | Repo today | Gap |
|---|---|---|---|
| 1 | **Talks like a person, instantly** — natural voice, no robotic cadence, sub-second replies | Browser `speechSynthesis`; full-response-then-speak; no streaming | 🔴 **Biggest single gap** |
| 2 | **Always listening** — "Jarvis?" wakes it, no click required | Ctrl+Space hotkey + substring hack; STT dies on Chrome tab blur | 🔴 |
| 3 | **Interruptible** — you can talk over it | RMS barge-in exists but only cancels `speechSynthesis` | 🟡 |
| 4 | **Does things, not just answers** — "Run the diagnostics", "Book it", "Lock the lab" | Tools exist (search/code/maps) but the **chat model has no function-calling loop**; actions are manual buttons in the HUD | 🔴 |
| 5 | **Remembers you** — names, projects, preferences, yesterday | Firestore text memories + 50-doc client cosine; no structured user model | 🟡 |
| 6 | **Sees** — camera/screens/environment, and reasons about it | Real webcam for chat; HUD vision is a **fake canvas** | 🟡 |
| 7 | **Initiates** — warns you unprompted about real things | Canned 25 s loop; "proactive" suggestions are seeded strings | 🔴 |
| 8 | **Runs the building** — lights, doors, suit, vehicles | 4 fake devices in a `Map` | 🟡 |
| 9 | **Everywhere** — workshop, phone, suit HUD, car | One browser tab | ⚪ |
| 10 | **Multi-agent** — "deploy the Iron Legion" | 3 parallel prompts, no real orchestration/verification | 🟡 |
| 11 | **Persona** — dry British wit, addresses "Sir", never breaks character | **Conflicting**: chat persona is "Aarsu, a sweet female companion" with a "soft girl voice"; HUD says "Sir" | 🔴 |
| 12 | **Presentation** — holographic HUD, arc reactor, suits | ✅ Genuinely strong | 🟢 |

**Bottom line:** the presentation layer (12) and the "chat with grounding" core (partial 5) are done. Items **1, 2, 4, 7, 11** are the ones that make or break the experience, and all five are currently missing or broken.

---

## 6. Model & dependency currency (verified against live Google docs, 2026-10-13)

Checked against `ai.google.dev/gemini-api/docs/models` and `/deprecations`:

| Model ID in repo | Used at | Live status | Action |
|---|---|---|---|
| `gemini-3.8-flash` | `server.ts`, `agentOrchestrator.ts` | ✅ Stable ("most intelligent Flash") | keep |
| `gemini-3.5-flash` | `server.ts` fallback, maps | ✅ Available | keep |
| `gemini-2.5-flash` | last fallback | ⚠️ Legacy; community reports intermittent 404 | replace with `gemini-3.6-flash` |
| `gemini-3.1-flash-lite` | `agentOrchestrator.ts` ×3 | 🔴 **Shut down** (`gemini-3.1-flash-lite-preview` on the deprecations page) | → `gemini-3.6-flash` |
| `imagen-3.0-generate-002` | `/api/jarvis/generate-3d-image` | 🔴 **Shut down 2025-11-10** | → `gemini-nano-banana-2.1` or `imagen-4.0-generate-001` |
| `text-embedding-004` | `/api/embed` | 🔴 **Not a documented model**; superseded by `gemini-embedding-001` / `gemini-embedding-2` | → `gemini-embedding-001` |
| — | — | ⚪ **`gemini-3.8-live` not used** | this is *the* model for a real-time JARVIS voice loop |
| — | — | ⚪ **`gemini-3.8-flash-tts` not used** | this is *the* model for a JARVIS voice |
| — | — | ⚪ `gemini-4-argon` (flagship reasoning, 1M ctx) not used | optional for deep-planning tasks |

Also unused but directly relevant: the **Live API** (bidirectional audio, live transcription, tool use, session management, ephemeral tokens) and **native function calling**.

**Finding M-1 (critical):** the app will silently lose image generation and semantic memory *today*, and the Iron Legion swarm will 404 on its shut-down model — yet all three fail *silently* behind `catch {}` and fake fallbacks, so nobody would notice. This is the most dangerous class of bug in the repo.

---

## 7. Security findings

### 7.1 S-1 — Wide-open CORS (High)
`app.use(cors())` with no `origin` allow-list. Combined with token-in-body OAuth (7.2), any web page a logged-in user visits can drive the API from their browser. Fix: pin `origin` to `APP_URL` and set `credentials: false`.

### 7.2 S-2 — Confused deputy: OAuth access token accepted from the request body (High)
`POST /api/chat` and `POST /api/proactive` take `token` from `req.body` and hand it straight to `google.auth.OAuth2().setCredentials({ access_token: token })`. The Firebase ID token (checked by `requireAuth`) and the Google access token (used for Calendar/Gmail/Drive) are **different credentials travelling through different channels**, and the Google one is never bound to the caller. A token leaked into logs/history/browser memory becomes a full Workspace bearer. Fix: move Workspace OAuth server-side, store refresh tokens keyed by Firebase `uid`, and never accept access tokens from the client body.

### 7.3 S-3 — Secrets committed (Medium)
`firebase-applet-config.json` (project `gen-lang-client-0142325351`) is committed with `apiKey` and `oAuthClientId`. These are *client* credentials and are expected to be public in a Firebase web app, **but** they are hard-coded rather than injected, so the same bundle cannot be pointed at a different project, and rotation requires a code change. Fix: inject via `VITE_*` env at build time; keep `.env` out of git (already gitignored).

### 7.4 S-4 — CSP disabled (Medium)
`helmet({ contentSecurityPolicy: false })`. Acceptable for local Vite HMR, not for production. Fix: enable CSP in production with a nonce, keep it off only in dev.

### 7.5 S-5 — Rate limiting is per-process and coarse (Medium)
`express-rate-limit` with `max: 100 / 15 min` on **all** of `/api/`. A single long chat session plus HUD polling can trip it, and it evaporates on restart / does not work across replicas. Fix: per-route limits, a shared store, and a separate higher ceiling for read-only telemetry.

### 7.6 S-6 — `trust proxy` + no proxy validation (Low/Medium)
`app.set('trust proxy', 1)` with an unvalidated hop count lets a client spoof `X-Forwarded-For` and bypass IP rate limits if deployed behind an unexpected topology. Fix: set it to the real hop count of your ingress.

### 7.7 S-7 — Firestore rules are allow-nothing by default (Low, informational)
`firestore.rules` denies `/{document=**}` and then allows `/users/{uid}/memories`. That is a *correct* default-deny posture — good. Note the **client** uses `getFirestore(app, "(default)")` while `dbService.ts` uses the Admin SDK default; keep the database IDs aligned.

### 7.8 S-8 — `bcrypt` / `jsonwebtoken` are dead weight (Low)
Both are declared dependencies and never imported anywhere. Dead attack surface + audit noise. Remove.

### 7.9 S-9 — Endpoints that mutate "hardware" have no authorization tier (Low)
`/api/jarvis/iot/*` (lockdown, blast doors) and `/api/jarvis/agent/run` are guarded only by "any authenticated user". Once IoT is real, this is a physical-security issue. Fix: mount the already-written `requireRole('admin')` and add an explicit confirmation step for destructive protocols.

---

## 8. Reliability & maintainability findings

### 8.1 R-1 — Everything "enterprise" is process-local (High)
The Redis cache, DB service, knowledge graph, IoT bridge, proactive daemon and RL scheduler are all in-memory singletons. Restart = total amnesia (except Firestore memories). The README advertises "PostgreSQL / Cloud SQL + Firestore", "Redis Cache", "Immutable Knowledge Graph" — none of which exist. This is a **truth-in-labeling** problem as much as a technical one.

### 8.2 R-2 — Silent failure everywhere (High)
`catch {}`, `catch { }` and fake-success fallbacks are pervasive (`generateContentWithFallback`, `/api/embed`, `/api/jarvis/generate-3d-image`, `agentOrchestrator`, `dbService`). Users are shown *plausible fiction* instead of an error. Combined with shut-down models (§6), the app can look healthy while three features are dead. Fix: structured errors + a real `/api/health` that reports per-dependency status.

### 8.3 R-3 — Zero tests, and junk test files (High)
There is no test framework, no `test` script, and no CI. The four files at repo root — `test-admin.js`, `test-firestore.js`, `test-firestore2.js`, `test-verify.js` — are throwaway scratch scripts that point at **a different Firebase project** (`gen-lang-client-0526957989`) than the app (`gen-lang-client-0142325351`). They should be deleted, not kept.

### 8.4 R-4 — Monoliths (Medium)
`server.ts` (918 L), `ChatInterface.tsx` (1,049 L) and `JarvisHud.tsx` (1,108 L) each mix data fetching, business logic and markup. `ChatInterface` alone re-implements TTS that `App.tsx` also implements — **there are two independent speech paths**, and the chat's presets do not affect the header's `handleVocalize`. This is why voice feels inconsistent.

### 8.5 R-5 — No streaming / no cancellation (Medium)
Every Gemini call is `await … generateContent` and the whole answer is returned as one JSON blob, then spoken. Perceived latency = model time + full text + TTS start. Real JARVIS is streaming. There is also no `AbortController` on outbound model calls, so a barge-in cannot cancel in-flight generation.

### 8.6 R-6 — 1.6 MB un-split bundle (Medium)
`three`, `d3`, `firebase` and the whole HUD ship in one chunk (420 kB gzip). Fix: route-level `React.lazy`, `manualChunks` for `three`/`d3`, and lazy-load the HUD tabs.

### 8.7 R-7 — Accessibility & responsiveness (Low)
No focus management, no ARIA on icon-only controls, no reduced-motion handling for the constantly animating HUD, and the mobile layout stacks a 45 vh stage over a 55 vh dock with the chat-collapse button hidden on small screens.

### 8.8 R-8 — Hacky global monkey-patches (Low)
`index.html` replaces `window.WebSocket` with a fake object to silence Vite HMR errors, and both `index.html` and `main.tsx` wrap `console.error`/`console.warn`. This hides real errors in production. Fix: configure `server.hmr: false` properly and delete the shims.

### 8.9 R-9 — Operational gaps (Medium)
No Dockerfile, no CI, no health/readiness split, no structured logging, no tracing, no metrics, no graceful shutdown, `PORT` hard-coded to `3000` (ignores `process.env.PORT`), and the backup cron is a no-op.

---

## 9. Documentation-vs-reality delta

The README is a marketing document, not documentation. Concrete overclaims:

| README claim | Reality |
|---|---|
| "Google Gemini 3.5 / 3.8 Flash **and Imagen 3.0**" | Imagen 3.0 is shut down |
| "PostgreSQL / Cloud SQL + Firestore", "Redis Cache" | Neither PostgreSQL nor Redis exists |
| "Immutable Knowledge Graph" | 5 hardcoded nodes in a `Map`, lost on restart |
| "Reinforcement Learning Feedback Loop / Policy Reward Optimization" | 4 scalar Q-weights nudged by ±1 |
| "MCP Hub (GitHub, Slack, Filesystem)" | No MCP protocol, and no GitHub/Slack/Filesystem connectors |
| "Automated Backups" | Cron body is comments |
| "Firebase Auth + OAuth 2.0 **Bearer tokens**" | Access token is passed in the JSON **body** |
| "Proactive Calendar & Email Daemon" | 25 s `setInterval` with canned strings |
| Quick Start `git clone https://github.com/aarsu/aarsu-cognitive-core.git` | Wrong URL (actual: `721189/AARSU-PA`) |
| Endpoint table lists 4 endpoints | There are 26 |

**Finding D-1 (High):** the README must be rewritten to match reality before anything else, because it currently sets expectations the code cannot meet — and it is the first thing any collaborator reads.

---

## 10. Prioritized findings summary

| ID | Sev | Area | Finding |
|---|---|---|---|
| **P0-1** | Critical | Voice | No real-time voice: browser TTS/STT instead of Gemini Live + Gemini TTS |
| **P0-2** | Critical | Persona | Chat persona ("Aarsu, sweet female companion") contradicts the JARVIS identity |
| **P0-3** | Critical | Models | 3 in-use model IDs are shut down / undocumented; failures are silent |
| **P0-4** | Critical | Agency | Chat has no function-calling loop — JARVIS cannot *act* from conversation |
| **P1-5** | High | Perception | HUD "vision" sends a hand-drawn fake canvas; wake word is a substring match |
| **P1-6** | High | Autonomy | Proactive daemon emits canned strings, not real reasoning over real events |
| **P1-7** | High | Security | Confused-deputy OAuth token in request body; wide-open CORS |
| **P1-8** | High | State | All "enterprise" state is in-process and lost on restart |
| **P1-9** | High | Quality | No tests, no CI, no Dockerfile; junk scratch files at repo root |
| **P1-10** | High | Docs | README overclaims wholesale |
| **P2-11** | Medium | MCP | "MCP hub" is not the Model Context Protocol |
| **P2-12** | Medium | Perf | 1.6 MB single bundle; no streaming; no abort/cancel |
| **P2-13** | Medium | Structure | 3 monoliths; two competing TTS code paths |
| **P2-14** | Medium | Ops | `PORT` hardcoded, CSP off, coarse rate limit, no logging/metrics |
| **P2-15** | Medium | Honesty | Simulated telemetry (random D3 chart, fake biometrics/IoT) presented as real |
| **P3-16** | Low | Cleanup | Dead deps (`bcrypt`, `jsonwebtoken`), WebSocket/console monkey-patches, stale lockfile |

---

*Continues in [`docs/JARVIS_BUILD_PLAN.md`](./JARVIS_BUILD_PLAN.md).*





