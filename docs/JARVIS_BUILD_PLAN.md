# J.A.R.V.I.S. Build Plan — from demo to assistant

**Companion to:** [`JARVIS_AUDIT.md`](./JARVIS_AUDIT.md) · **Repo:** `721189/AARSU-PA` · **Branch:** `cline/028k86jn`

---

## How to read this plan

- **Phases are ordered by *perceived JARVIS-ness per unit of work*, not by technical tidiness.** Phase 1 (voice) will change how the app feels more than everything else combined, so it comes before "proper" things like a database.
- **Effort** is in *engineering days* (one focused dev). Multiply by your own availability.
- **Definition of Done** is given per phase as *observable* behaviour, so you can verify without reading code.
- **Nothing here is speculative technology** — every model/tool named is a currently-documented Google/Gemini capability (§6 of the audit) or a standard protocol (MCP, Matter, WebRTC).

## Target architecture (what "done" looks like)

```
┌─ Always-on client (PWA / desktop shell) ─────────────────────────────┐
│  Wake-word (local, low-power) → Live API session (WebSocket, PCM16)  │
│  Barge-in handled by Live API VAD + AbortController                  │
│  HUD: arc reactor, holograms, visemes driven by real audio envelope  │
│  Screen + camera capture (getDisplayMedia / getUserMedia)            │
└───────────────┬──────────────────────────────────────────────────────┘
                │ ephemeral token (short-lived, minted server-side)
┌───────────────▼──────────────────────────────────────────────────────┐
│  Orchestrator (server) — single "brain" module                       │
│   • persona.ts         one JARVIS identity, one voice config         │
│   • tools/             function declarations + executors             │
│   • toolLoop.ts        model → tool → model until done               │
│   • memory/            server-side embeddings + vector search        │
│   • events/            calendar/gmail/system event bus               │
│   • mcp/               real MCP server (stdio + Streamable HTTP)     │
│   • adapters/          Workspace, HomeAssistant/Matter, FS, shell    │
└───────────────┬──────────────────────────────────────────────────────┘
                │
   Postgres/Cloud SQL (graph + memory + audit) · Redis/Memorystore (cache, rate limit)
   Pub/Sub (Gmail/Calendar push) · Cloud Run (deploy) · OpenTelemetry (traces)
```

---

## Phase 0 — Stabilize & tell the truth  ·  **1–2 days**  ·  *unblocks everything*

**Why first:** you cannot build on a foundation that lies. Right now the app silently swallows failures and the README promises systems that do not exist.

| Task | Detail |
|---|---|
| 0.1 Fix model IDs | `gemini-3.1-flash-lite` → `gemini-3.6-flash`; `imagen-3.0-generate-002` → `gemini-nano-banana-2.1`; `text-embedding-004` → `gemini-embedding-001`; replace `gemini-2.5-flash` fallback with `gemini-3.6-flash`. Centralise in one `src/server/models.ts`. |
| 0.2 Kill silent failure | Replace `catch {}` with structured errors; add `AppError` + an error middleware; a real `/api/health` that pings Gemini, Firestore and reports `degraded` per dependency. |
| 0.3 Delete junk | Remove `test-admin.js`, `test-firestore.js`, `test-firestore2.js`, `test-verify.js` (they target a *different* Firebase project). Fix the stale `package-lock.json`. Remove unused `bcrypt` / `jsonwebtoken`. |
| 0.4 Remove global hacks | Delete the `window.WebSocket` shim and the `console.warn/error` wrappers in `index.html` / `main.tsx`; configure `server.hmr:false` properly. |
| 0.5 Config | `PORT = process.env.PORT ?? 3000`; inject Firebase config via `VITE_*`; `.env.example` updated. |
| 0.6 Rewrite README | Describe what exists; add a "Roadmap" section pointing here. Fix the clone URL. |
| 0.7 Test harness | Add Vitest + a `npm test` script; write contract tests for all 26 routes (auth 401/200, shape assertions). Add GitHub Actions: `tsc --noEmit`, `build`, `test`. |

**DoD:** `npm test` passes; `/api/health` reports per-dependency status; no shut-down model IDs remain; README matches reality; CI is green.

---

## Phase 1 — The voice (the single highest-impact phase)  ·  **5–8 days**

**Why:** "talks like a person, instantly, and you can interrupt it" *is* the JARVIS feeling. Today it is a robot reading a paragraph after a 3-second wait.

| Task | Detail |
|---|---|
| 1.1 Gemini TTS | Replace `speechSynthesis` with **`gemini-3.8-flash-tts`** (studio-grade, expressive). Stream audio chunks and play through WebAudio so speech starts in ~300 ms instead of after the full text. |
| 1.2 Live API session | Add a **Live API** path using **`gemini-3.8-live`**: bidirectional PCM16 over WebSocket, server-side VAD, native interruption. This is the real "JARVIS conversation" loop. |
| 1.3 Ephemeral tokens | Mint short-lived tokens server-side (`/api/live/token`) so the browser never holds the API key. |
| 1.4 Real wake word | Replace `transcript.includes('jarvis')` with a **local, always-on wake-word engine** (e.g. Porcupine or a Silero-VAD + keyword model). Must run without a mic-permission click per session and must not fire on the word "aarsu" mid-sentence. |
| 1.5 Barge-in, properly | Keep the RMS detector as a fallback, but prefer Live API interruption; wire `AbortController` so barge-in cancels the *in-flight model call*, not just playback. |
| 1.6 One speech path | Delete the duplicate TTS in `ChatInterface.tsx` and `App.tsx`. One `useJarvisVoice()` hook owns TTS/STT/visemes/barge-in. Visemes driven by the **real audio envelope** (analyser node), not word regex. |
| 1.7 Streaming text | Add SSE/streaming for `/api/chat` so text appears as it is generated, and TTS starts on the first sentence. |

**DoD:** Say "Jarvis" hands-free → it answers in a natural voice in under ~1 s; you can talk over it and it stops immediately; the avatar's mouth tracks the actual audio; no API key in the browser.

**Risks:** Live API session limits and cost; browser autoplay policies (unlock AudioContext on first gesture); mic permission UX on Safari/Firefox.

---

## Phase 2 — Agency: JARVIS must *act*, not just answer  ·  **5–7 days**

**Why:** "Run diagnostics", "Book it", "Lock the lab", "Find that file" — JARVIS does things. Today every action is a button in the HUD; the conversation cannot touch the tools.

| Task | Detail |
|---|---|
| 2.1 Tool registry | Define all capabilities as **native function declarations** (`tools: [{ functionDeclarations: [...] }]`): `web_search`, `run_code`, `read_calendar`, `create_event`, `search_email`, `send_email`, `read_file`, `write_file`, `run_shell`, `get_system_stats`, `control_device`, `remember`, `recall`, `generate_image`. |
| 2.2 Tool loop | `toolLoop.ts`: model → tool calls → execute → feed results back → repeat until the model stops calling tools (with a max-iteration guard + confirmation gate for destructive tools). |
| 2.3 Single action layer | Route **all** HUD buttons through the same executors the model uses, so the UI and the conversation can never drift apart. |
| 2.4 Confirmation & safety | Destructive tools (`run_shell`, `write_file`, `control_device`, `send_email`) require explicit confirmation; add an allow-list of paths/commands and a dry-run mode. |
| 2.5 Real multi-agent | Turn "Iron Legion" into a real orchestrator: planner → parallel workers → **verifier** that checks the workers' output, with retries. Persist each mission. |
| 2.6 Computer use (optional) | Add Gemini's **computer-use** tool for real screen automation (click/type/navigate) behind an explicit opt-in. |

**DoD:** In chat you can say "what's on my calendar tomorrow and email the team a summary" and it does it; every HUD action is also reachable by voice; destructive actions always ask first.

---

## Phase 3 — Memory & identity  ·  **3–4 days**

| Task | Detail |
|---|---|
| 3.1 One persona | Create `persona.ts`. Make **JARVIS** the default identity: British, dry wit, addresses the user as "Sir", never breaks character, no emoji. Delete the "Aarsu, sweet female companion" prompt and the "soft girl voice" presets — or keep them behind an explicit `persona: 'aarsu'` / `'jarvis'` switch that defaults to JARVIS. |
| 3.2 Server-side embeddings | Move embedding generation + retrieval server-side using `gemini-embedding-001`; stop shipping 50 docs to the browser. |
| 3.3 Vector search | Store vectors in Firestore vector search or Postgres + `pgvector`; retrieve top-k server-side with metadata filters. |
| 3.4 Structured user model | Beyond raw text: a profile (name, timezone, projects, preferences, devices, do-not-disturb hours) that the persona reads every turn. |
| 3.5 Episodic memory | Persist conversation summaries + a "what happened" timeline so "remember last week's outage?" works. |
| 3.6 Knowledge graph persistence | Move `knowledgeGraph.ts` off the in-process `Map` into Postgres/Firestore; keep the BFS query but make it durable and queryable. |

**DoD:** JARVIS consistently addresses you as "Sir" with a British register; it recalls a fact you told it yesterday and a project name from last month; restarting the server loses nothing.

---

## Phase 4 — Perception: really see and hear  ·  **3–5 days**

| Task | Detail |
|---|---|
| 4.1 Delete the fake canvas | `JarvisHud.runVisionAnalysis` must capture the **real** camera frame (or `getDisplayMedia` for the screen) — remove the hand-drawn "TARGET ACQUIRED" canvas. |
| 4.2 Screen understanding | Add `getDisplayMedia` capture so JARVIS can read your screen: "what's this error?", "summarise this page", "what does this code do?". |
| 4.3 Ambient vision | Optional low-rate frame sampling (1 frame / 5 s) with on-device gating so it does not burn quota; let JARVIS comment on the room only when relevant. |
| 4.4 Audio understanding | Feed room audio to Live API so it can react to a spoken name, a doorbell, or a question addressed to it without a wake word. |
| 4.5 Privacy controls | Hard mic/camera kill switch, visible recording indicator, per-feature consent, and a clear "nothing is stored unless you say remember". |

**DoD:** "Jarvis, what's on my screen?" returns an accurate description of the actual screen; the mic indicator is honest; nothing leaves the device without a visible indicator.

---

## Phase 5 — Proactivity: initiate, don't just respond  ·  **4–6 days**

| Task | Detail |
|---|---|
| 5.1 Real event sources | Google Calendar **push channels**, Gmail via **Pub/Sub**, system telemetry, and (later) Home Assistant state. Replace the 25 s canned loop. |
| 5.2 Relevance engine | Score events against the user model + history; only surface what clears a threshold. Dedup aggressively. |
| 5.3 Real interruption policy | Quiet hours, "focus mode", urgency tiers, and a "say it now / queue it / never" feedback that actually tunes weights (replace the toy Q-table with real bandit updates **or** delete the "RL" claim). |
| 5.4 Pre-meeting briefs | "You have the Q4 review in 20 minutes; here are the 3 open items from the last one." Grounded in real calendar + email + memory. |
| 5.5 Morning/evening briefings | Proactive summaries at set times, delivered by voice. |

**DoD:** JARVIS warns you about a real upcoming meeting with a *useful* brief, unprompted, at most once per event; you can mute it and it learns.

---

## Phase 6 — Real integrations  ·  **5–8 days**

| Task | Detail |
|---|---|
| 6.1 Real MCP server | Replace the REST façade with a real **Model Context Protocol** server (JSON-RPC 2.0, `initialize`/`tools/list`/`tools/call`, Streamable HTTP + stdio) using `@modelcontextprotocol/sdk`, so external clients (Claude Desktop, IDEs) can drive your tools — and so you can *consume* third-party MCP servers as JARVIS tools. |
| 6.2 Server-side Workspace OAuth | Move Google OAuth server-side: store refresh tokens keyed by Firebase `uid`; never accept an access token from the request body. Wire the scopes the README already advertises (Gmail, Calendar, Drive, Docs). |
| 6.3 Home / IoT | Implement an adapter interface (`iotBridge` becomes a driver, not a `Map`) for **Home Assistant** (REST/WebSocket) and/or **Matter**. Then the existing "blast door / HVAC / lighting" UI controls something real. |
| 6.4 Filesystem & shell | Scope real FS/shell tools to an allow-listed workspace root with audit logging. |
| 6.5 Third-party connectors | GitHub, Slack, Notion — as MCP servers or typed tools, not hardcoded API keys. |

**DoD:** Claude Desktop (or any MCP client) lists your tools and calls them successfully; "turn off the lab lights" changes a real device; OAuth tokens never travel through the client.

---

## Phase 7 — Everywhere & always-on  ·  **4–6 days**

| Task | Detail |
|---|---|
| 7.1 PWA / installable | Service worker, offline shell, install to home screen / desktop. |
| 7.2 Always-on background | Wake word + Live session that survives tab blur (dedicated worker; native shell if needed). |
| 7.3 Device handoff | Start a conversation on desktop, continue on phone; session state server-side. |
| 7.4 Voice on the move | Optional native wrapper (Capacitor/Tauri) for real background mic access. |
| 7.5 Multi-user / RBAC | Actually mount `requireRole`; separate personal vs. shared/facility actions. |

**DoD:** JARVIS runs on your phone and desktop, wakes hands-free, and remembers the conversation when you switch devices.

---

## Phase 8 — Hardening & operations  ·  **3–5 days**

| Task | Detail |
|---|---|
| 8.1 Deploy | Dockerfile + Cloud Run (or Fly/Render); `PORT` from env; graceful shutdown; health/readiness split. |
| 8.2 Observability | `pino` structured logs, OpenTelemetry traces, token/cost metrics, per-tool latency, error dashboards. |
| 8.3 Security | CORS allow-list, CSP with nonce, per-route rate limits with a shared store, secrets from Secret Manager, dependency scanning, `npm audit` in CI. |
| 8.4 Perf | Code-split `three`/`d3`/HUD tabs, lazy routes; target < 250 kB gzip initial. |
| 8.5 Real backups | Replace the comment-only cron with a real Firestore/Postgres export. |
| 8.6 E2E tests | Playwright: wake word → voice answer → tool call → confirmation. |

**DoD:** One-command deploy; a dashboard shows live traces and cost; a security review finds no High findings from §7.

---

## Sequencing & milestones

| Milestone | Phases | Cumulative effort | What you can demo |
|---|---|---|---|
| **M1 — Honest** | 0 | 1–2 d | Builds, tests, health endpoint, truthful README |
| **M2 — It talks** | 1 | 6–10 d | Hands-free "Jarvis?" → natural voice, interruptible |
| **M3 — It acts** | 2 | 11–17 d | Voice-driven real tasks (calendar, email, files, code) |
| **M4 — It knows you** | 3 | 14–21 d | Consistent persona, durable memory, restart-safe |
| **M5 — It sees** | 4 | 17–26 d | Screen + camera understanding |
| **M6 — It initiates** | 5 | 21–32 d | Useful unprompted briefings |
| **M7 — It connects** | 6 | 26–40 d | Real MCP, real devices, server-side OAuth |
| **M8 — It's everywhere** | 7 | 30–46 d | Phone + desktop, always-on |
| **M9 — Production** | 8 | 33–51 d | Deployable, observable, secure |

**Recommended order if you only do a few:** **0 → 1 → 2 → 3.** Those four phases (≈14–21 days) deliver roughly 80% of the JARVIS *feeling*. Phases 4–8 make it real and durable.

---

## The "is it JARVIS yet?" acceptance test

Run this end-to-end; all must pass for M1–M3 to be considered done.

1. You say **"Jarvis"** from across the room, hands-free, and it responds in a natural voice in **< 1 second**.
2. You **talk over it** and it stops instantly.
3. It **does not** trigger on the word "aarsu" mid-sentence.
4. You say *"what's on my calendar tomorrow?"* → accurate, grounded in your real calendar.
5. You say *"email the team a summary of it"* → it drafts, **asks for confirmation**, then sends.
6. You say *"what's on my screen?"* → it describes your **actual** screen.
7. You say *"remember that the arc reactor uses palladium"* → next session it recalls it.
8. You restart the server → **nothing is forgotten**.
9. It addresses you as **"Sir"**, with consistent dry British wit, every time.
10. No API key, access token, or secret is ever visible in the browser or in a request body.

---

## Explicit non-goals / honest limitations

- **Not building an actual Iron Man suit.** "IoT control" means real smart-home devices via Home Assistant/Matter — not repulsors.
- **Biometrics are simulated.** The `{heartRate, stressIndex}` telemetry has no real sensor. Either wire a wearable (HealthKit / Google Fit / a BLE device) or **label it as a demo** in the UI. Do not present `Math.random()` as telemetry.
- **The D3 diagnostic chart must plot real metrics** (`os.*`, process stats, API latency) or be removed. Same rule for the "arc power" gauge.
- **The Holo-CAD explode slider should actually move geometry**, or be removed.
- **"Reinforcement learning" must become a real (if simple) bandit** with logged rewards, or be renamed "preference weighting".
- **Always-on audio has real privacy and cost implications.** Budget for it, and give the user an unambiguous kill switch.
- **Full film-JARVIS (autonomous suit control, global surveillance) is not a goal** — and shouldn't be.

---

## Immediate next 5 PRs (start here)

1. **`fix(models)`** — Phase 0.1 + 0.2: correct model IDs, central `models.ts`, no silent catches, real `/api/health`.
2. **`chore(hygiene)`** — Phase 0.3–0.5: delete junk tests, fix lockfile, drop dead deps, remove global shims, `PORT` from env.
3. **`docs(readme)`** — Phase 0.6: rewrite the README to match reality + link this plan.
4. **`feat(voice)`** — Phase 1.1–1.3: Gemini TTS + Live API + ephemeral tokens behind a feature flag, alongside the existing path.
5. **`feat(tools)`** — Phase 2.1–2.2: function declarations + tool loop with a confirmation gate, starting with read-only tools.



