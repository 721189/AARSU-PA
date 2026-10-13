# AARSU-PA

AARSU-PA is a TypeScript full-stack assistant application with a JARVIS-inspired interface.
It combines a React + Vite frontend with an Express backend, Gemini integrations, Firebase auth, Google Workspace utilities, and simulation-friendly system modules.

## Current Project Status

This repository is an active modernization target. Some subsystems are intentionally simulated/in-memory for safe development and demo usage.

### Simulation mode

`SIMULATION_MODE=true` by default.

When simulation mode is enabled, the following are simulated/in-memory unless replaced with real adapters:
- IoT bridge/device state
- Biometric telemetry
- Knowledge graph state
- Redis-like cache

The workspace endpoint (`/api/fs/workspace`) exposes `simulationMode` and `simulatedServices` so runtime status is explicit.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind
- **Backend:** Node.js, Express, TypeScript
- **AI:** `@google/genai` (Gemini + image generation)
- **Auth/Data:** Firebase client + Firebase Admin, Firestore
- **Security:** Helmet, CORS, Express rate limiting

## Repository structure

```text
server.ts                  Main server composition and route mounting
src/server/config.ts       Typed runtime configuration
src/server/routes/         Extracted backend route modules (modularization in progress)
src/lib/                   Client-side logic modules (voice, memory, graph, etc.)
src/components/            UI components and HUD modules
```

## Getting started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Create a `.env` file in the repository root using `.env.example`:

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
NODE_ENV=development
SIMULATION_MODE=true
ENABLE_VOICE=true
ENABLE_WORKSPACE=true
APP_URL=http://localhost:3000
VITE_OAUTH_CLIENT_ID=your_google_oauth_client_id
```

### 3) Run locally

```bash
npm run dev
```

### 4) Production build

```bash
npm run build
npm start
```

## Available scripts

- `npm run dev` — run backend + Vite dev pipeline via `tsx server.ts`
- `npm run lint` — TypeScript type-check (`tsc --noEmit`)
- `npm run build` — build frontend and bundle server
- `npm start` — run bundled server from `dist/server.cjs`

## Key API groups

- `/api/chat` — primary chat endpoint
- `/api/fs/*` — workspace/system metadata endpoints
- `/api/mcp/*` — MCP-style tools/resources endpoints
- `/api/jarvis/*` — assistant-specific feature endpoints (vision, search, IoT, diagnostics, etc.)

## Free deployment options

Because this app includes both frontend and backend, prefer a platform that supports Node.js services.

### Option A (recommended): Render free tier

1. Push this repo to GitHub.
2. Create a new **Web Service** on Render from this repo.
3. Set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Add environment variables from `.env.example` (especially `GEMINI_API_KEY`).
5. Deploy.

### Option B: Railway / Fly.io free credits

Use the same build/start commands:
- Build: `npm install && npm run build`
- Start: `npm start`

### Option C: split deployment

- Frontend on Vercel/Netlify (free plans)
- Backend on Render/Railway/Fly

## Deployment notes

- Do not expose secrets to the client.
- `GEMINI_API_KEY` must be set in server environment variables.
- Keep `SIMULATION_MODE=true` unless real infrastructure is wired.
- For production, set `NODE_ENV=production`.

## License

This project is provided under the repository's license terms.
