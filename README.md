# Aarsu — cross-domain personal AI assistant

Aarsu is an early-stage personal AI assistant with a JARVIS-inspired interface. It combines a React + Express application, Gemini reasoning, Firebase authentication and memory, browser voice/camera input, grounded research, and optional Google Workspace tools.

The goal is a useful assistant across research, engineering, learning, writing, data analysis, productivity, and strategy—not a claim of unrestricted autonomous computer control.

## Operating modes

The chat interface provides eight modes:

- **Auto** — infer the most useful workflow from the request.
- **Research** — source-led research, evidence comparison, and synthesis.
- **Engineering** — architecture, debugging, security, and technical delivery.
- **Learning** — explanations, study plans, worked examples, and practice.
- **Writing** — drafting, editing, and communication.
- **Data analysis** — spreadsheets, calculations, statistics, and interpretation.
- **Productivity** — calendar, email, Drive, Docs, and Sheets workflows.
- **Strategy** — planning, prioritization, trade-offs, and execution roadmaps.

The selected mode changes the assistant's operating instructions. Auto mode uses a lightweight intent router; users can override it at any time.

## Capabilities in this release

### Research and reasoning
- Google Search grounding for current and source-dependent questions.
- A bounded, multi-step tool loop that lets the assistant search, inspect returned data, and then continue with a follow-up tool call.
- Google-hosted code execution for calculations and code-assisted reasoning in engineering, research, learning, and data-analysis modes. This sandbox does not access the user's computer.

### Google Workspace (user connects Google OAuth)
- Read upcoming Calendar events.
- Search Gmail and return metadata plus short snippets.
- Search Google Drive by file content/name.
- Read text from Google Docs (up to 15,000 characters).
- Read the first worksheet of a Google Spreadsheet, bounded to `A1:Z500` and a maximum response size.
- Prepare Calendar events, Gmail drafts, and Google Docs behind an explicit approval step.

Google Workspace reads are read-only. Calendar event creation, Gmail draft creation, and Google Doc creation are saved as pending actions; the user sees the complete preview and must approve before execution. Gmail drafts are never sent.

### Personal interface
- User-scoped Firestore conversation memory.
- Browser speech recognition and speech synthesis. Listening begins through explicit user action; this is not a native always-on wake-word engine.
- Camera snapshot analysis after explicit browser permission.
- Per-user simulated IoT demo devices and user-reported/simulated telemetry.

## Action safety and data boundaries

Aarsu does not send email, make purchases, delete user data, run shell commands on the user's computer, or control physical devices. The IoT bridge is simulated. Default biometric values are simulated and are not readings from a wearable or medical device.

The assistant's Workspace tool loop is bounded to four rounds and five declared tool calls per round. Read operations can run directly. Creating a Calendar event, Gmail draft, or Google Doc always requires explicit approval of the exact preview. Approval requests are isolated to the authenticated Firebase user's Firestore subcollection and expire after ten minutes.

Retrieved memory is supplied as context, not as instructions. Personal Workspace data is accessed only through the Google account whose OAuth access token is provided for that request.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS and React Three Fiber
- Node.js and Express
- Google Gen AI SDK
- Firebase Authentication and Firestore
- Google APIs: Calendar, Gmail, Drive, Docs and Sheets
- Helmet, CORS and Express rate limiting

## Setup

1. Install dependencies with `npm install`.
2. Create an environment file from `.env.example`.
3. Configure `GEMINI_API_KEY`.
4. Configure Firebase client settings and Firebase Admin credentials. Admin credentials must be supplied through the deployment environment and must never be committed.
5. Set `APP_URL` to the public app origin and `VITE_OAUTH_CLIENT_ID` to the Google OAuth Web Client ID.
6. Configure the Google OAuth consent screen and authorized JavaScript origins.
7. Run `npm run dev`.

### Google Workspace OAuth scopes

The client requests Gmail read-only + compose, Calendar events, Drive read-only, Google Docs, and Google Sheets read-only scopes. Users may need to reconnect Workspace and grant the updated scopes after deployment. Use the narrowest practical scopes for your deployment.

## API endpoints

- `GET /api/assistant/capabilities` — available operating modes, tools, and explicit limitations.
- `POST /api/assistant/execute` — run a domain-aware assistant turn.
- `GET /api/assistant/actions/pending` — list the authenticated user's pending approvals.
- `POST /api/assistant/actions/:actionId/approve` — approve and execute a previewed Workspace action.
- `POST /api/assistant/actions/:actionId/cancel` — reject a pending action.
- `GET /api/mcp/tools` and `POST /api/mcp/tools/call` — Aarsu's application-specific authenticated HTTP tool gateway. This is not a standalone MCP transport server.

## Commands

- `npm run dev` — Express + Vite development server
- `npm run lint` — TypeScript check
- `npm test` — validation and domain-routing tests
- `npm run build` — frontend and server build
- `npm start` — production server

## Infrastructure status

- The cache is a process-local JavaScript Map with TTL cleanup, not managed Redis.
- The IoT bridge is an in-memory, per-user simulation.
- Proactive suggestions and pending approvals are stored in per-user Firestore subcollections when Firestore is configured.
- Automated backups are not enabled. Configure and test Firestore export and restore before storing production data.

## Current limitations

Aarsu is not a complete Iron Man J.A.R.V.I.S. system. It currently has no arbitrary local computer/terminal control, native always-on wake-word engine, real wearable telemetry, physical IoT integration, outbound email sending, autonomous purchasing, or unattended background task execution. It does not yet ingest arbitrary PDFs or local files. Google Sheets reading is limited to the first worksheet and the range listed above. GitHub, Slack, browser automation, and third-party domain connectors are not yet integrated into the app.

New integrations should use least-privilege credentials, per-user isolation, explicit approvals for side effects, audit trails, bounded tool execution, and live integration tests.

## License

No license file is currently included. Add a LICENSE file before distributing or accepting external contributions.
