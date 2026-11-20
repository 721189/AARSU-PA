# Aarsu — personal AI assistant

Aarsu is an early-stage personal AI assistant with a JARVIS-inspired interface. It combines a React + Express application, Gemini reasoning, Firebase authentication and memory, browser voice and camera input, and optional Google Workspace tools.

## Capabilities in this release

- Conversational assistance using Gemini and grounded Google Search.
- User-scoped Firestore conversation memory.
- Browser speech recognition and speech synthesis. Listening starts through an explicit user action; this is not an always-on hardware wake-word engine.
- Camera snapshot analysis after explicit camera permission.
- Read upcoming Google Calendar events and search Gmail after connecting Google Workspace.
- Prepare Calendar events, Gmail drafts and Google Docs behind an explicit approval step.
- Store pending action requests under the authenticated user's Firestore path.
- Generate per-user proactive suggestions from connected Workspace data.
- Per-user simulated IoT demo devices and per-user biometric telemetry.
- MCP-style HTTP tool/resource endpoints. This is an application-specific HTTP tool gateway, not a standalone MCP transport server.

## Action safety

Aarsu does not send email, make purchases, delete user data, run shell commands on the user's computer or control physical devices.

Calendar reads and Gmail search are read-only. Creating a Calendar event, Gmail draft or Google Doc creates a pending request; the authenticated user must approve the exact request in the interface before it runs. A Gmail draft is never sent automatically.

The IoT bridge is simulated and cannot control physical hardware. Biometric values are simulated until the user submits telemetry; they are not readings from a wearable or medical device. Host diagnostics describe the server, not the user's local computer.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS and React Three Fiber
- Node.js and Express
- Google Gen AI SDK
- Firebase Authentication and Firestore
- Google APIs: Calendar, Gmail and Docs
- Helmet, CORS and Express rate limiting

## Setup

1. Install dependencies with npm ci.
2. Create an environment file from .env.example.
3. Configure GEMINI_API_KEY.
4. Configure Firebase client settings and Firebase Admin credentials. Admin credentials must be supplied through the deployment environment and must never be committed.
5. Set APP_URL to the public app origin and VITE_OAUTH_CLIENT_ID to the Google OAuth Web Client ID.
6. Configure the Google OAuth consent screen and add the required authorized JavaScript origins.
7. Run npm run dev.

## Google Workspace OAuth

The client requests Gmail modify, Calendar, Drive read-only and Google Docs scopes. Current assistant actions only search/read Gmail and Calendar, create Gmail drafts, create Calendar events and create Google Docs. Sending email is not implemented.

When requested scopes change, users may need to reconnect Google Workspace and grant consent again. Use the narrowest practical scopes for your deployment.

## Commands

- npm run dev — Express + Vite development server
- npm run lint — TypeScript check
- npm test — assistant action validation tests
- npm run build — frontend and server build
- npm start — production server

## Infrastructure status

- The IoT bridge is an in-memory, per-user simulation.
- The cache is a process-local JavaScript Map with TTL cleanup, not managed Redis.
- The knowledge graph is a small, shared, non-personal assistant architecture graph.
- Proactive suggestions and pending approvals are stored in per-user Firestore subcollections when Firestore is configured.
- Telemetry is stored under each user's Firestore document when available, with a per-process, per-user fallback.
- Automated backups are not enabled. The server logs a warning rather than claiming a backup completed. Configure and test Firestore export and restore before storing production data.

## Deployment

Use a Node.js service such as Cloud Run or Render.

- Build command: npm ci && npm run build
- Start command: npm start
- Server secrets: GEMINI_API_KEY and Firebase Admin credentials
- Public configuration: Firebase web config and Google OAuth client ID
- PORT is read from the hosting environment.
- Set APP_URL to the deployed application origin when cross-origin clients are used.

## Current limitations

Aarsu is not a complete Iron Man J.A.R.V.I.S. system. It currently does not have operating-system control, a native always-on wake-word engine, real wearable telemetry, live physical IoT integrations, outbound email sending or arbitrary autonomous computer use. New integrations should use least-privilege credentials, explicit approvals, user-scoped storage and integration tests.

Image generation uses Gemini's Nano Banana Interactions API. Access to image-generation models may require an eligible billing setup in Google AI Studio.

## License

No license file is currently included. Add a LICENSE file before distributing or accepting external contributions.
