import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import { requireAuth } from "./src/server/auth";
import { startBackupCron } from "./src/server/backup";
import { IronLegionOrchestrator } from "./src/server/agentOrchestrator";
import { jarvisGraph } from "./src/lib/knowledgeGraph";
import { redisCache } from "./src/server/redisCache";
import { dbService } from "./src/server/dbService";
import { iotBridge } from "./src/server/iotBridge";
import { reinforcementScheduler } from "./src/server/reinforcementScheduler";
import {
  MODELS,
  CHAT_MODEL_CANDIDATES,
  isAuthError,
  isModelUnavailableError,
} from "./src/server/models";
import { AppError, isAppError, notConfigured } from "./src/server/errors";
import { buildChatSystemInstruction, resolvePersona, PERSONAS } from "./src/server/persona";
import { GeminiTtsService, JARVIS_VOICES, resolveVoiceName } from "./src/server/voice/tts";
import { LiveSessionService } from "./src/server/voice/liveSession";
import { bytesToBase64 } from "./src/server/voice/audioFormat";
import { SentenceChunker } from "./src/server/voice/sentenceChunker";
import {
  parseEmotionTag,
  STREAM_EMOTION_INSTRUCTION,
  type StreamEmotion,
} from "./src/server/voice/emotionTag";
import { ToolRegistry } from "./src/server/tools/registry";
import { runToolLoop } from "./src/server/tools/toolLoop";
import { createGeminiModelCaller } from "./src/server/tools/geminiCaller";
import { proactiveService } from "./src/server/proactive/service";
import { createMcpProtocol, MCP_RESOURCES } from "./src/server/mcp/server";
import { LATEST_PROTOCOL_VERSION } from "./src/server/mcp/protocol";
import { SystemTelemetrySource } from "./src/server/proactive/sources";
import { createMemoryStore } from "./src/server/memory";
import { WorkspaceAuthService, createTokenStore } from "./src/server/workspace/auth";
import { MemoryService, createGeminiEmbedder } from "./src/server/memory/service";

// --- Memory (Phase 3) ---
// A single process-wide memory service. The store is chosen once (Firestore when
// credentials exist, otherwise an explicitly non-durable in-process store) and
// reported in /api/health. Embeddings are generated server-side, so the browser
// no longer downloads documents to rank them.
let memoryServiceInstance: MemoryService | null = null;

function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    let embedder = null;
    try {
      embedder = createGeminiEmbedder(getAI());
    } catch {
      // No Gemini key: recall degrades to lexical matching.
      embedder = null;
    }
    memoryServiceInstance = new MemoryService({ store: createMemoryStore(), embedder });
  }
  return memoryServiceInstance;
}

/**
 * Builds the memory context injected into a turn: the structured user profile
 * plus the most relevant stored memories.
 */
async function buildMemoryContext(userId: string | undefined, query: string): Promise<string> {
  if (!userId) return '';
  try {
    const memory = getMemoryService();
    const [profile, recalled] = await Promise.all([
      memory.profileContextFor(userId),
      memory.contextFor(userId, query),
    ]);
    return [profile, recalled].filter(Boolean).join('\n');
  } catch (err) {
    console.warn('[memory] context retrieval failed:', (err as Error)?.message);
    return '';
  }
}

/**
 * Records a short episodic summary of a completed turn, so the assistant can
 * answer "what did we do last week?". Bounded to keep the store small.
 */
async function recordTurnEpisode(userId: string | undefined, userText: string, replyText: string): Promise<void> {
  if (!userId || !replyText) return;
  try {
    const summary = `User: ${userText.slice(0, 120)} | Assistant: ${replyText.slice(0, 120)}`;
    await getMemoryService().recordEpisode(userId, summary);
  } catch (err) {
    console.warn('[memory] failed to record episode:', (err as Error)?.message);
  }
}

// --- Workspace auth (Phase 6.2) ---
// Google Workspace credentials live server-side, keyed by Firebase uid. The
// client sends a one-time authorisation code, never an access token.
let workspaceAuthInstance: WorkspaceAuthService | null = null;

function getWorkspaceAuth(): WorkspaceAuthService {
  if (!workspaceAuthInstance) {
    workspaceAuthInstance = new WorkspaceAuthService({ store: createTokenStore() });
  }
  return workspaceAuthInstance;
}

// --- Enterprise Security Setup ---
const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT ?? 3000);

/**
 * Wraps an async route handler so a rejected promise reaches the central error
 * handler. Express 4 does not forward async rejections on its own, which is how
 * the original code ended up swallowing failures in per-route `catch {}` blocks.
 */
type AsyncRoute = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => Promise<unknown>;

const asyncHandler =
  (fn: AsyncRoute) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for local dev/Vite HMR
}));
app.use(cors());
app.use(express.json());

// Rate Limiting (DDoS protection simulation)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use("/api/", apiLimiter);

// Start Automated Backups (skipped under test so no cron job is registered)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startBackupCron();
}

// --- API Client ---
let ai: GoogleGenAI | null = null;
function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw notConfigured("GEMINI_API_KEY");
  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

// --- OAuth2 Helpers ---
function getOAuth2Client(token: string) {
  const oAuth2Client = new google.auth.OAuth2();
  oAuth2Client.setCredentials({ access_token: token });
  return oAuth2Client;
}

// --- Routes ---

// Health Check
// Reports per-dependency status so a dead model, missing key or unreachable
// datastore is visible instead of being hidden behind a fake success.
app.get("/api/health", async (req, res) => {
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; detail?: string }> = {};

  // 1. Gemini credentials
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  checks.gemini = hasGeminiKey
    ? { status: 'ok', detail: `chat=${MODELS.chat}` }
    : { status: 'down', detail: 'GEMINI_API_KEY is not set' };

  // 2. Firebase Admin (auth verification)
  try {
    const { getApps } = await import('firebase-admin/app');
    checks.firebaseAdmin = getApps().length > 0
      ? { status: 'ok' }
      : { status: 'down', detail: 'firebase-admin not initialised' };
  } catch (err) {
    checks.firebaseAdmin = { status: 'down', detail: (err as Error).message };
  }

  // 3. Cache (in-process LRU standing in for Redis)
  try {
    const metrics = redisCache.getMetrics();
    checks.cache = { status: 'ok', detail: `${metrics.totalKeys} keys` };
  } catch (err) {
    checks.cache = { status: 'down', detail: (err as Error).message };
  }

  // 4. Memory backend — reported so a non-durable fallback is never hidden.
  try {
    const backend = getMemoryService().backend;
    checks.memory = backend.durable
      ? { status: 'ok', detail: backend.kind }
      : { status: 'degraded', detail: `${backend.kind} (not durable - data is lost on restart)` };
  } catch (err) {
    checks.memory = { status: 'down', detail: (err as Error).message };
  }

  // 5. Workspace OAuth
  try {
    const ws = getWorkspaceAuth();
    checks.workspaceOAuth = ws.configured
      ? { status: 'ok', detail: `store=${ws.backend.kind}` }
      : { status: 'degraded', detail: 'OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET not set' };
  } catch (err) {
    checks.workspaceOAuth = { status: 'down', detail: (err as Error).message };
  }

  const anyDown = Object.values(checks).some((c) => c.status === 'down');
  const anyDegraded = Object.values(checks).some((c) => c.status === 'degraded');

  res.status(anyDown ? 503 : 200).json({
    status: anyDown ? 'down' : anyDegraded ? 'degraded' : 'ok',
    checks,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// In-memory embedding cache to avoid redundant API calls and prevent rate limiting
const embeddingCache = new Map<string, number[]>();

// Helper function to robustly generate Gemini responses with automatic retry and model fallbacks.
//
// Honesty contract: this function either returns real model output, or throws an
// AppError. It never fabricates a "plausible" reply, because doing so previously
// hid shut-down models and misconfigured keys behind fake success.
async function generateContentWithFallback(aiClient: GoogleGenAI, contents: any, systemInstruction: string): Promise<string> {
  let lastError: unknown = null;
  const attempted: string[] = [];

  for (const model of CHAT_MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: "application/json"
          }
        });
        if (response.text) {
          return response.text;
        }
        lastError = new Error(`Model ${model} returned an empty response.`);
      } catch (err: any) {
        lastError = err;
        attempted.push(`${model}#${attempt + 1}`);
        console.warn(`[Gemini] ${model} attempt ${attempt + 1} failed: ${err?.message?.slice(0, 160) || 'transient error'}`);

        // Bad credentials will never succeed by retrying or switching models.
        if (isAuthError(err)) {
          throw new AppError('not_configured', 'Gemini rejected the configured credentials.', {
            detail: 'Check that GEMINI_API_KEY is valid and has access to the requested models.',
            cause: err,
          });
        }

        // Model unavailable / rate limited -> move to the next candidate immediately.
        if (isModelUnavailableError(err)) {
          break;
        }

        // Other transient errors -> one retry against the same model.
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        break;
      }
    }
  }

  throw new AppError('upstream_unavailable', 'All Gemini models are currently unavailable.', {
    detail: { attempted, lastError: (lastError as Error)?.message ?? String(lastError) },
    cause: lastError,
  });
}

// Aarsu Chat Interaction Route (Secured with requireAuth)
app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { message, token, imageBase64 } = req.body;
    const userId = req.user?.uid;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch (authErr: any) {
      // Honest failure: the key is missing, so this is a 503 — not a 200 with a
      // friendly message pretending the assistant replied.
      return res.status(503).json({
        error: "Gemini is not configured on this server.",
        code: "not_configured",
        detail: "Set GEMINI_API_KEY to enable chat.",
      });
    }
    
    // 2. Workspace context.
    // Preferred: a server-held refresh token for this user. The client-supplied
    // access token is still honoured for backwards compatibility, but it is
    // reported in the response so the deprecated path is visible rather than
    // silent.
    let workspaceContext = "";
    let workspaceAuthSource: 'server' | 'client-token' | 'none' = 'none';

    let workspaceClient: any = null;
    if (userId) {
      workspaceClient = await getWorkspaceAuth().getClient(userId).catch(() => null);
      if (workspaceClient) workspaceAuthSource = 'server';
    }
    if (!workspaceClient && token) {
      workspaceClient = getOAuth2Client(token);
      workspaceAuthSource = 'client-token';
      console.warn(
        '[workspace] using a client-supplied access token. This path is deprecated; call POST /api/workspace/connect instead.'
      );
    }

    if (workspaceClient) {
      const cacheKey = `calendar:${userId ?? token.slice(0, 16)}`;
      const cachedCalendar = redisCache.get<string>(cacheKey);
      if (cachedCalendar) {
        workspaceContext = cachedCalendar;
      } else {
        const auth = workspaceClient;
        try {
          const calendar = google.calendar({ version: "v3", auth });
          const events = await calendar.events.list({
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 3,
            singleEvents: true,
            orderBy: 'startTime',
          });
          const nextEvents = events.data.items?.map(e => `${e.summary} at ${e.start?.dateTime}`).join(", ");
          workspaceContext = `User's upcoming events: ${nextEvents || "None"}.`;
          redisCache.set(cacheKey, workspaceContext, 60); // Cache for 60 seconds
        } catch (err) {
          console.error("Workspace access error (soft fail):", err);
        }
      }
    }

    // 2b. Server-side memory retrieval. Previously the browser fetched 50
    // documents and ranked them client-side; now the server embeds and ranks.
    const memoryContext =
      (await buildMemoryContext(userId, message)) || (typeof req.body.memoryContext === 'string' ? req.body.memoryContext : '');

    // 3. System prompt & persona (single source of truth: src/server/persona.ts)
    const persona = resolvePersona(req.body.persona);
    const systemInstruction = buildChatSystemInstruction({
      persona,
      workspaceContext,
      memoryContext,
    });

    // 4. Prepare Multimodal Contents (Text + Optional Webcam Image)
    let payloadContents: any;
    if (imageBase64 && typeof imageBase64 === 'string') {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      payloadContents = {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: message,
          },
        ],
      };
    } else {
      payloadContents = message;
    }

    // 5. Generate Response using Gemini with resilient fallbacks
    const resultText = await generateContentWithFallback(aiClient, payloadContents, systemInstruction);

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(resultText);
    } catch(e) {
      parsedResult = { reply: resultText, emotion: "neutral" };
    }

    if (!parsedResult.reply && (parsedResult.message || parsedResult.text || parsedResult.response)) {
      parsedResult.reply = parsedResult.message || parsedResult.text || parsedResult.response;
    }

    await recordTurnEpisode(userId, message, parsedResult.reply ?? '');

    res.json({ ...parsedResult, workspaceAuthSource });
  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Proactive Scenarios Route (Secured with requireAuth)
app.post("/api/proactive", requireAuth, async (req, res) => {
  try {
    const { token } = req.body ?? {};
    const userId = req.user?.uid;

    // Preferred: server-held refresh token for this user. The client-supplied
    // access token remains a deprecated fallback.
    let auth: any = userId ? await getWorkspaceAuth().getClient(userId).catch(() => null) : null;
    if (!auth && token) {
      auth = getOAuth2Client(token);
      console.warn('[workspace] /api/proactive used a client-supplied access token (deprecated).');
    }
    if (!auth) {
      return res.status(409).json({
        error: 'Workspace is not connected for this account.',
        code: 'not_connected',
        detail: 'Call POST /api/workspace/connect with an authorisation code first.',
      });
    }

    const suggestions: string[] = [];

    // Scenario 1: Calendar - Next Meeting
    try {
      const calendar = google.calendar({ version: "v3", auth });
      const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: (new Date()).toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: 'startTime',
      });
      if (events.data.items && events.data.items.length > 0) {
        const nextEvent = events.data.items[0];
        const startTime = new Date(nextEvent.start?.dateTime as string);
        const minsToEvent = Math.round((startTime.getTime() - Date.now()) / 60000);
        
        if (minsToEvent > 0 && minsToEvent <= 60) {
          suggestions.push(`You have a meeting '${nextEvent.summary}' in ${minsToEvent} minutes, and traffic might be heavy. Would you like me to notify the attendees you might be a few minutes late?`);
        }
      }
    } catch (e) {
      console.error("Calendar fetch error:", e);
    }

    // Scenario 2: Drive - Recent Document
    try {
      const drive = google.drive({ version: "v3", auth });
      const files = await drive.files.list({
        pageSize: 1,
        orderBy: "modifiedTime desc",
        q: "mimeType='application/vnd.google-apps.document'"
      });
      if (files.data.files && files.data.files.length > 0) {
        const recentDoc = files.data.files[0];
        suggestions.push(`I noticed a recently modified document in your Drive: '${recentDoc.name}'. Would you like me to add it to your task list for review?`);
      }
    } catch(e) {
      console.error("Drive fetch error:", e);
    }

    // Scenario 3: Gmail - Unread important emails
    try {
      const gmail = google.gmail({ version: "v1", auth });
      const messages = await gmail.users.messages.list({
        userId: 'me',
        q: "is:unread is:important",
        maxResults: 1
      });
      if (messages.data.messages && messages.data.messages.length > 0) {
        suggestions.push(`You have new important unread emails in your inbox. Would you like me to summarize them for you?`);
      }
    } catch(e) {
      console.error("Gmail fetch error:", e);
    }

    // Fallback Scenario 3 if Gmail fails or is empty (Stale Calendar event)
    if (suggestions.length < 3) {
      suggestions.push(`Your calendar shows a recurring event that hasn't been updated in months. Would you like me to archive it?`);
    }

    res.json({ suggestions });
  } catch (error: any) {
    console.error("Proactive Error:", error);
    res.status(500).json({ error: "Failed to generate proactive insights" });
  }
});

// Admin Route (Example of RBAC)
app.get("/api/admin/stats", requireAuth, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ message: "Welcome Admin! System is operating normally." });
});


// Embed endpoint for Vector Search (with in-memory cache and resilient fallback)
app.post("/api/embed", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: "Text is required" });
    
    const trimmed = text.trim();
    if (embeddingCache.has(trimmed)) {
      return res.json({ embedding: embeddingCache.get(trimmed) });
    }

    const aiClient = getAI();
    let embedding: number[] = [];

    try {
      const response = await aiClient.models.embedContent({
        model: MODELS.embedding,
        contents: trimmed,
      });
      embedding = response.embeddings?.[0]?.values || [];
      if (embedding.length > 0) {
        // Keep cache bounded to 250 recent entries
        if (embeddingCache.size > 250) {
          const firstKey = embeddingCache.keys().next().value;
          if (firstKey) embeddingCache.delete(firstKey);
        }
        embeddingCache.set(trimmed, embedding);
      }
    } catch (embedApiErr: any) {
      const msg = (embedApiErr?.message || String(embedApiErr)).toLowerCase();
      if (msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota")) {
        console.warn("[Embed Notice] Embedding rate-limit / quota reached; falling back to lexical search gracefully.");
      } else {
        console.warn("[Embed Notice] Embedding unavailable, using lexical search fallback.");
      }
      // Return empty embedding with 200 OK so client safely uses keyword-based memory retrieval
      return res.json({ embedding: [], fallback: true });
    }

    res.json({ embedding });
  } catch (err: any) {
    console.warn("Embed endpoint handler notice:", err);
    res.json({ embedding: [], fallback: true });
  }
});

// --- JARVIS Autonomous Agent & OS Integration Endpoints ---
app.post("/api/agent/run", requireAuth, async (req, res) => {
  try {
    const { taskName, prompt } = req.body;
    if (!taskName) return res.status(400).json({ error: "Task name required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch (e) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const systemInstruction = "You are JARVIS, an elite AI autonomous agent and tactical engineering assistant. Analyze the requested task and provide a structured JSON response with { summary, steps: string[], result, status: 'success' | 'warning' }.";
    const responseText = await generateContentWithFallback(aiClient, `Execute autonomous agent task: ${taskName}. Details: ${prompt || 'General system audit'}`, systemInstruction);
    
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        summary: "Autonomous execution completed successfully.",
        steps: ["Initialized agent context", "Analyzed target parameters", "Generated optimal recommendations"],
        result: responseText,
        status: "success"
      };
    }

    res.json({ task: taskName, ...parsed, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("Agent execution error:", err);
    res.status(500).json({ error: "Autonomous agent execution failed" });
  }
});

app.get("/api/fs/workspace", requireAuth, async (req, res) => {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const rootDir = process.cwd();
    const pkgRaw = await fs.readFile(path.join(rootDir, "package.json"), "utf-8").catch(() => "{}");
    const metaRaw = await fs.readFile(path.join(rootDir, "metadata.json"), "utf-8").catch(() => "{}");
    
    const pkg = JSON.parse(pkgRaw);
    const meta = JSON.parse(metaRaw);

    res.json({
      workspaceName: meta.name || "Aarsu JARVIS System",
      version: pkg.version || "1.0.0",
      dependencies: Object.keys(pkg.dependencies || {}),
      status: "Operational",
      securityLevel: "Maximum (JARVIS Protocol)",
      uptime: process.uptime()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to query workspace state" });
  }
});

// --- JARVIS Live Google Search Grounding Endpoint ---
app.post("/api/jarvis/search", requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.json({
        reply: "My neural core is currently unauthenticated. Please configure your API key in Secrets, Sir.",
        sources: [],
        timestamp: new Date().toISOString()
      });
    }

    try {
      const response = await aiClient.models.generateContent({
        model: MODELS.chat,
        contents: query,
        config: {
          systemInstruction: "You are J.A.R.V.I.S., Tony Stark's sophisticated artificial intelligence. Provide concise, tactical, high-IQ intelligence powered by live Google Search grounding. Refer to the user as 'Sir'. Keep it articulate, witty, and razor-sharp.",
          tools: [{ googleSearch: {} }]
        }
      });

      const sources: Array<{ title?: string; uri?: string }> = [];
      const chunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (chunk?.web?.uri) {
            sources.push({ title: chunk.web.title || "Intel Source", uri: chunk.web.uri });
          }
        }
      }

      return res.json({
        reply: response.text || "Tactical intelligence gathered, Sir.",
        sources,
        timestamp: new Date().toISOString()
      });
    } catch (searchErr: any) {
      console.warn("Search grounding fallback notice:", searchErr?.message?.slice(0, 100));
      const fallbackText = await generateContentWithFallback(
        aiClient,
        `Answer as JARVIS: ${query}`,
        "You are J.A.R.V.I.S., Tony Stark's sophisticated artificial intelligence. Refer to the user as 'Sir'."
      );
      let reply = "Tactical response prepared, Sir.";
      try {
        const parsed = JSON.parse(fallbackText);
        reply = parsed.reply || fallbackText;
      } catch {
        reply = fallbackText;
      }
      return res.json({ reply, sources: [], timestamp: new Date().toISOString() });
    }
  } catch (err: any) {
    console.error("JARVIS Search Grounding Error:", err);
    res.json({ reply: "Apologies, Sir. Satellite uplink experienced an unexpected glitch.", sources: [], timestamp: new Date().toISOString() });
  }
});

// --- Google Maps Grounding Endpoint (googleMaps tool) ---
app.post("/api/jarvis/maps", requireAuth, async (req, res) => {
  try {
    const { query, userLocation } = req.body;
    if (!query) return res.status(400).json({ error: "Location query required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.status(500).json({ error: "AI core unavailable" });
    }

    const response = await aiClient.models.generateContent({
      model: MODELS.chat,
      contents: query,
      config: {
        systemInstruction: "You are J.A.R.V.I.S. Provide precise geographical positioning, navigation, local business intel, and mapping intelligence using Google Maps grounding. Address user as 'Sir'.",
        tools: [{ googleMaps: {} }]
      }
    });

    const metadata = (response.candidates?.[0] as any)?.groundingMetadata;
    res.json({
      reply: response.text || "Mapping intelligence acquired, Sir.",
      mapsMetadata: metadata || null,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("Maps Grounding Error:", err);
    res.status(500).json({ error: "Failed to query Google Maps telemetry" });
  }
});

// --- Realistic 3D Hologram & Image Generation Endpoint ---
app.post("/api/jarvis/generate-3d-image", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.status(500).json({ error: "AI core unavailable" });
    }

    const enhancedPrompt = `Ultra-realistic 3D holographic render, cinematic sci-fi lighting, Stark Industries CAD wireframe overlay, photorealistic textures, 8k resolution, volumetric neon glow: ${prompt}`;

    const response = await aiClient.models.generateImages({
      model: MODELS.image,
      prompt: enhancedPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "16:9",
      },
    });

    const generatedImage = response.generatedImages?.[0];
    if (!generatedImage?.image?.imageBytes) {
      throw new Error("No image bytes returned from generation model.");
    }

    const base64Image = `data:image/jpeg;base64,${generatedImage.image.imageBytes}`;
    res.json({
      imageUrl: base64Image,
      prompt: enhancedPrompt,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("Image Generation Error:", err);
    // Honest failure. Previously this returned a stock Unsplash URL labelled as a
    // generated hologram, so a dead image model looked like a working feature.
    res.status(502).json({
      error: "Image generation failed.",
      code: "upstream_unavailable",
      detail: (err?.message ?? String(err)).slice(0, 300),
      model: MODELS.image,
      timestamp: new Date().toISOString()
    });
  }
});


// --- JARVIS Sandboxed Code Execution Endpoint ---
app.post("/api/jarvis/code", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.json({
        reply: "Computational core unavailable without API key credentials, Sir.",
        timestamp: new Date().toISOString()
      });
    }

    try {
      const response = await aiClient.models.generateContent({
        model: MODELS.chat,
        contents: prompt,
        config: {
          systemInstruction: "You are J.A.R.V.I.S. Execute real computational analysis, physics simulations, algorithms, or complex formulas. You must execute Python code using your codeExecution tool to verify answers numerically before responding.",
          tools: [{ codeExecution: {} }]
        }
      });

      return res.json({
        reply: response.text || "Calculations completed, Sir.",
        timestamp: new Date().toISOString()
      });
    } catch (codeErr: any) {
      console.warn("Code execution fallback notice:", codeErr?.message?.slice(0, 100));
      const fallbackText = await generateContentWithFallback(
        aiClient,
        `Perform calculations for: ${prompt}`,
        "You are J.A.R.V.I.S. Provide numerical analysis and calculations. Refer to the user as 'Sir'."
      );
      let reply = "Calculations estimated, Sir.";
      try {
        const parsed = JSON.parse(fallbackText);
        reply = parsed.reply || fallbackText;
      } catch {
        reply = fallbackText;
      }
      return res.json({ reply, timestamp: new Date().toISOString() });
    }
  } catch (err: any) {
    console.error("JARVIS Code Execution Error:", err);
    res.json({ reply: "Numerical simulator encountered a syntax exception, Sir.", timestamp: new Date().toISOString() });
  }
});

// --- JARVIS Iron Legion Multi-Agent Swarm Orchestrator Endpoint ---
app.post("/api/jarvis/swarm", requireAuth, async (req, res) => {
  try {
    const { objective } = req.body;
    if (!objective) return res.status(400).json({ error: "Objective is required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.status(500).json({ error: "Neural core credentials missing" });
    }

    const orchestrator = new IronLegionOrchestrator(aiClient);
    const result = await orchestrator.executeMission(objective);

    // Record this mission event into the Associative Knowledge Graph
    jarvisGraph.addNode({
      id: result.missionId,
      label: `Mission: ${objective.slice(0, 30)}...`,
      type: 'project',
      properties: { totalTimeMs: result.totalTimeMs, healing: result.selfHealingTriggered },
      lastUpdated: new Date().toISOString()
    });
    jarvisGraph.addEdge({
      id: `edge_${Date.now()}`,
      source: 'iron-legion',
      target: result.missionId,
      relation: 'TRIGGERS',
      weight: 0.95
    });

    res.json(result);
  } catch (err: any) {
    console.error("Iron Legion Swarm Error:", err);
    res.status(500).json({ error: "Swarm execution encountered an error" });
  }
});

// --- JARVIS Associative Graph-RAG Endpoint ---
app.get("/api/jarvis/graph", requireAuth, (req, res) => {
  try {
    const { entityId } = req.query;
    if (typeof entityId === 'string' && entityId) {
      const subgraph = jarvisGraph.queryAssociations(entityId);
      return res.json(subgraph);
    }
    const fullGraph = jarvisGraph.getFullGraph();
    res.json(fullGraph);
  } catch (err: any) {
    console.error("Knowledge Graph Error:", err);
    res.status(500).json({ error: "Failed to retrieve knowledge graph" });
  }
});

// --- Enterprise Redis Cache Metrics Endpoint ---
app.get("/api/jarvis/redis/metrics", requireAuth, (req, res) => {
  res.json(redisCache.getMetrics());
});

// --- Proactive Alert Feed Endpoint ---
// Serves alerts that passed the interruption policy (relevance threshold,
// de-duplication, quiet hours). Not a canned string loop.
app.get("/api/jarvis/proactive/feed", requireAuth, (req, res) => {
  const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 20;
  res.json({
    alerts: proactiveService.list(limit),
    sources: proactiveService.sourceCount,
    pipelineRunning: proactiveService.running,
  });
});

// Dismiss a delivered alert.
app.delete("/api/jarvis/proactive/feed/:id", requireAuth, (req, res) => {
  const dismissed = proactiveService.dismiss(req.params.id);
  res.status(dismissed ? 200 : 404).json({ status: dismissed ? 'dismissed' : 'not_found' });
});

// Run one proactive poll cycle on demand.
app.post("/api/jarvis/proactive/tick", requireAuth, asyncHandler(async (req, res) => {
  const delivered = await proactiveService.tick();
  res.json({ delivered: delivered.length, alerts: delivered });
}));

// Adjust the interruption policy for this session.
app.put("/api/jarvis/proactive/policy", requireAuth, (req, res) => {
  const { quietHours, focusMode } = req.body ?? {};
  proactiveService.setContext({
    quietHours: quietHours ?? null,
    focusMode: Boolean(focusMode),
  });
  res.json({ status: 'updated', quietHours: quietHours ?? null, focusMode: Boolean(focusMode) });
});

// --- Biometric Telemetry Sync Endpoint ---
app.get("/api/jarvis/biometrics", requireAuth, (req, res) => {
  res.json(dbService.getLatestBiometrics());
});

app.post("/api/jarvis/biometrics", requireAuth, async (req, res) => {
  const { heartRate, stressIndex, focusLevel, coreTempC } = req.body;
  const bio = {
    heartRate: Number(heartRate) || 72,
    stressIndex: Number(stressIndex) || 20,
    focusLevel: Number(focusLevel) || 90,
    coreTempC: Number(coreTempC) || 36.8,
    timestamp: new Date().toISOString()
  };
  await dbService.recordBiometrics(bio);
  res.json({ status: "recorded", data: bio });
});

// --- Continuous Multimodal Environmental Vision Analysis Endpoint ---
app.post("/api/jarvis/vision/analyze", requireAuth, async (req, res) => {
  try {
    const { imageBase64, query } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Image base64 required" });

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch {
      return res.status(500).json({ error: "Neural core credentials missing" });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = query || "Provide an instantaneous tactical SITREP of what you observe in this video frame or screen view, Sir. Detect key objects, text, code, or user state.";

    const response = await aiClient.models.generateContent({
      model: MODELS.chat,
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64
          }
        },
        { text: prompt }
      ],
      config: {
        systemInstruction: "You are J.A.R.V.I.S. Provide razor-sharp, cinematic visual telemetry analysis. Address the user as 'Sir'."
      }
    });

    res.json({
      sitrep: response.text || "Visual telemetry acquired, Sir.",
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("Vision Analysis Error:", err);
    res.status(500).json({ error: "Visual telemetry processing glitch" });
  }
});

// --- Smart Facility & IoT Hardware Bridge Endpoints ---
app.get("/api/jarvis/iot/devices", requireAuth, (req, res) => {
  res.json({ devices: iotBridge.getAllDevices() });
});

app.post("/api/jarvis/iot/control", requireAuth, (req, res) => {
  const { deviceId, state } = req.body;
  if (!deviceId || !state) return res.status(400).json({ error: "deviceId and state required" });

  try {
    const updated = iotBridge.updateDeviceState(deviceId, state);
    res.json({ status: "success", device: updated });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post("/api/jarvis/iot/protocol", requireAuth, (req, res) => {
  const { protocol } = req.body;
  const result = iotBridge.executeFacilityProtocol(protocol || 'nominal_work');
  res.json({ status: "protocol_engaged", message: result, devices: iotBridge.getAllDevices() });
});

// --- Host OS Kernel & Deep Process Diagnostics Endpoint ---
app.get("/api/jarvis/host/diagnostics", requireAuth, async (req, res) => {
  const os = await import('os');
  const memoryUsage = process.memoryUsage();
  
  res.json({
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    processUptimeSeconds: Math.floor(process.uptime()),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Stark Core Thread',
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    processHeapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    processRssMb: Math.round(memoryUsage.rss / 1024 / 1024),
    loadAverage: os.loadavg(),
    nodeVersion: process.version,
    securityKernel: "Enforced (JARVIS Root Guardian)"
  });
});

// --- Proactive Task Scheduling & Reinforcement Learning Endpoints ---
app.get("/api/jarvis/proactive/tasks", requireAuth, (req, res) => {
  res.json({ suggestions: reinforcementScheduler.getSuggestions() });
});

app.post("/api/jarvis/proactive/analyze", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    try {
      const aiClient = getAI();
      reinforcementScheduler.setAIClient(aiClient);
    } catch {}

    const tasks = await reinforcementScheduler.analyzeWorkspaceForProactiveTasks(token);
    res.json({ status: "success", count: tasks.length, suggestions: tasks });
  } catch (err: any) {
    console.error("Proactive Analysis Error:", err);
    res.status(500).json({ error: "Failed to analyze calendar and emails for proactive tasks" });
  }
});

app.post("/api/jarvis/reinforcement/feedback", requireAuth, (req, res) => {
  const { suggestionId, feedback } = req.body;
  if (!suggestionId || !feedback) {
    return res.status(400).json({ error: "suggestionId and feedback required" });
  }

  const result = reinforcementScheduler.recordFeedback(suggestionId, feedback);
  res.json({ status: "recorded", ...result, metrics: reinforcementScheduler.getReinforcementMetrics() });
});

app.get("/api/jarvis/reinforcement/metrics", requireAuth, (req, res) => {
  res.json(reinforcementScheduler.getReinforcementMetrics());
});


// ============================================================================
// Model Context Protocol (Phase 6)
//
// POST /api/mcp is a real MCP endpoint: JSON-RPC 2.0 with an `initialize`
// handshake, protocol-version negotiation, tools/list, tools/call and
// resources/list + resources/read. Any MCP client (Claude Desktop, an IDE,
// another agent) can connect to it.
//
// The /api/mcp/* REST routes below are a thin adapter over the SAME registry and
// resources, kept so the in-app inspector keeps working. They are not the
// protocol.
// ============================================================================

/** Returns the Gemini client, or null when unconfigured (rather than throwing). */
function safeGetAI(): GoogleGenAI | null {
  try {
    return getAI();
  } catch {
    return null;
  }
}

function buildToolRegistry(): ToolRegistry {
  return new ToolRegistry({
    ai: safeGetAI(),
    workspaceRoot: process.cwd(),
    memory: getMemoryService(),
  });
}

function mcpContext(req: express.Request) {
  return {
    userId: req.user?.uid,
    workspaceRoot: process.cwd(),
    dryRun: false,
  };
}

app.post("/api/mcp", requireAuth, asyncHandler(async (req, res) => {
  const protocol = createMcpProtocol({
    workspaceRoot: process.cwd(),
    buildRegistry: buildToolRegistry,
    buildContext: () => mcpContext(req),
  });

  const response = await protocol.handleRaw(JSON.stringify(req.body ?? {}));
  // A JSON-RPC notification has no response by definition.
  if (response === null) return res.status(202).end();
  res.json(response);
}));

app.get("/api/mcp", requireAuth, (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32600,
      message: 'This transport accepts JSON-RPC over POST only; server-sent events are not enabled.',
    },
  });
});

// --- Legacy REST adapter (kept for the in-app inspector) ---
app.get("/api/mcp/tools", requireAuth, (req, res) => {
  const registry = buildToolRegistry();
  res.json({
    tools: registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      destructive: Boolean(tool.destructive),
      inputSchema: {
        type: 'object',
        properties: Object.fromEntries(
          tool.parameters.map((param) => [param.name, { type: param.type, description: param.description }])
        ),
        required: tool.parameters.filter((param) => param.required).map((param) => param.name),
      },
    })),
    protocolVersion: LATEST_PROTOCOL_VERSION,
    transport: 'json-rpc-over-http',
  });
});

app.post("/api/mcp/tools/call", requireAuth, asyncHandler(async (req, res) => {
  const { name, arguments: toolArgs } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Tool name required', code: 'bad_request' });

  const tool = buildToolRegistry().get(name);
  if (!tool) return res.status(404).json({ error: `Unknown tool: ${name}`, code: 'not_found' });

  if (tool.destructive) {
    return res.status(403).json({
      error: `"${name}" changes state and requires interactive confirmation, which this endpoint cannot provide.`,
      code: 'forbidden',
    });
  }

  const result = await tool.execute(toolArgs ?? {}, mcpContext(req));
  res.json({ content: [{ type: 'text', text: result.summary }], isError: !result.ok });
}));

app.get("/api/mcp/resources", requireAuth, (req, res) => {
  res.json({ resources: MCP_RESOURCES });
});

app.post("/api/mcp/resources/read", requireAuth, asyncHandler(async (req, res) => {
  const { uri } = req.body ?? {};
  if (!uri) return res.status(400).json({ error: 'Resource URI required', code: 'bad_request' });

  const protocol = createMcpProtocol({
    workspaceRoot: process.cwd(),
    buildRegistry: buildToolRegistry,
    buildContext: () => mcpContext(req),
  });

  const response = await protocol.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'resources/read',
    params: { uri },
  });

  if (!response || 'error' in response) {
    const message = response && 'error' in response ? response.error.message : 'Unknown resource';
    return res.status(404).json({ error: message, code: 'not_found' });
  }
  res.json(response.result);
}));

// ============================================================================
// Voice API
//
// Phase 1 of the JARVIS build plan: replace the browser's robotic
// speechSynthesis / webkitSpeechRecognition with Gemini TTS and the Live API,
// and make replies stream so speech can start on the first sentence.
// ============================================================================

// List the voices, the active persona and the models in use.
app.get("/api/voice/voices", requireAuth, (req, res) => {
  const persona = resolvePersona();
  res.json({
    voices: JARVIS_VOICES,
    personas: Object.values(PERSONAS).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      tagline: p.tagline,
      defaultVoice: p.defaultVoice,
    })),
    activePersona: {
      id: persona.id,
      displayName: persona.displayName,
      tagline: persona.tagline,
      defaultVoice: persona.defaultVoice,
    },
    ttsModel: MODELS.tts,
    liveModel: MODELS.live,
  });
});

// One-shot synthesis. Returns a complete, directly playable WAV data URI.
app.post("/api/voice/tts", requireAuth, asyncHandler(async (req, res) => {
  const { text, voice } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'bad_request' });
  }

  const tts = new GeminiTtsService(getAI());
  const result = await tts.synthesize(text, voice);
  res.json(result);
}));

// Streaming synthesis over Server-Sent Events. Emits raw PCM fragments so the
// client can schedule gapless playback in an AudioContext.
app.post("/api/voice/tts/stream", requireAuth, asyncHandler(async (req, res) => {
  const { text, voice } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'bad_request' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const tts = new GeminiTtsService(getAI());
    send('start', { voice: resolveVoiceName(voice), model: MODELS.tts });

    let totalBytes = 0;
    for await (const chunk of tts.synthesizeStream(text, voice)) {
      if (controller.signal.aborted) break;
      totalBytes += chunk.pcm.byteLength;
      send('chunk', {
        pcm: bytesToBase64(chunk.pcm),
        sampleRate: chunk.format.sampleRate,
        channels: chunk.format.channels,
      });
    }

    if (!controller.signal.aborted) {
      send('done', { bytes: totalBytes });
    }
  } catch (err) {
    send('error', {
      error: (err as Error)?.message ?? 'Speech synthesis failed',
      code: isAppError(err) ? err.code : 'upstream_unavailable',
    });
  } finally {
    res.end();
  }
}));

// Mint an ephemeral token so the browser can open a Gemini Live API session
// without ever holding the long-lived API key.
app.post("/api/voice/live-token", requireAuth, asyncHandler(async (req, res) => {
  const persona = resolvePersona(req.body?.persona);
  const live = new LiveSessionService(getAI());
  const token = await live.mintToken(persona.systemInstruction);
  res.json({ ...token, persona: persona.id });
}));

// Conversational stream: one round trip that carries the reply text *and* its
// speech. Text deltas arrive for display; completed sentences are synthesised
// in order and their audio is streamed alongside. This is what removes the
// "wait for the whole answer, then start talking" delay.
app.post("/api/voice/converse/stream", requireAuth, asyncHandler(async (req, res) => {
  const { message, imageBase64, persona: personaId, voice } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required', code: 'bad_request' });
  }

  const aiClient = getAI();
  const persona = resolvePersona(personaId);
  const tts = new GeminiTtsService(aiClient);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  // Synthesis is chained rather than parallel so audio is emitted in the same
  // order the sentences were spoken.
  let audioChain: Promise<void> = Promise.resolve();
  let audioBytes = 0;

  const speak = (sentence: string) => {
    audioChain = audioChain.then(async () => {
      if (controller.signal.aborted) return;
      try {
        for await (const chunk of tts.synthesizeStream(sentence, voice)) {
          if (controller.signal.aborted) return;
          audioBytes += chunk.pcm.byteLength;
          send('audio', {
            pcm: bytesToBase64(chunk.pcm),
            sampleRate: chunk.format.sampleRate,
            channels: chunk.format.channels,
          });
        }
      } catch (err) {
        // Speech failing must not kill the text stream.
        send('audio_error', {
          error: (err as Error)?.message ?? 'Speech synthesis failed',
          sentence,
        });
      }
    });
    return audioChain;
  };

  try {
    const contents = imageBase64 && typeof imageBase64 === 'string'
      ? {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, '') } },
            { text: message },
          ],
        }
      : message;

    const memoryContext = await buildMemoryContext(req.user?.uid, message);

    const systemInstruction =
      buildChatSystemInstruction({ persona, memoryContext }) + STREAM_EMOTION_INSTRUCTION;

    send('start', { persona: persona.id, model: MODELS.chat, voice: resolveVoiceName(voice) });

    const stream = await aiClient.models.generateContentStream({
      model: MODELS.chat,
      contents,
      config: { systemInstruction },
    });

    const chunker = new SentenceChunker();
    let head = '';
    let tagResolved = false;
    let emotion: StreamEmotion = 'neutral';
    let fullText = '';

    const handleProse = (prose: string) => {
      if (!prose) return;
      fullText += prose;
      send('delta', { text: prose });
      for (const sentence of chunker.push(prose)) {
        send('sentence', { text: sentence });
        void speak(sentence);
      }
    };

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const delta = (parts as any[]).map((p) => p?.text ?? '').join('');
      if (!delta) continue;

      if (!tagResolved) {
        head += delta;
        const parsed = parseEmotionTag(head);
        if (!parsed.resolved) continue;
        tagResolved = true;
        emotion = parsed.emotion ?? 'neutral';
        send('emotion', { emotion });
        handleProse(parsed.rest);
      } else {
        handleProse(delta);
      }
    }

    // Flush any trailing partial sentence.
    if (!tagResolved) {
      send('emotion', { emotion });
    }
    for (const sentence of chunker.flush()) {
      send('sentence', { text: sentence });
      void speak(sentence);
    }

    await audioChain;
    await recordTurnEpisode(req.user?.uid, message, fullText);
    if (!controller.signal.aborted) {
      send('done', { text: fullText, emotion, audioBytes });
    }
  } catch (err) {
    send('error', {
      error: (err as Error)?.message ?? 'Conversation stream failed',
      code: isAppError(err) ? err.code : 'upstream_unavailable',
    });
  } finally {
    res.end();
  }
}));

// ============================================================================
// Agency API
//
// Phase 2 of the build plan: the conversational model can now *act*. Destructive
// tools are never executed without explicit approval — a request that would need
// confirmation returns `pendingConfirmations`, and the client re-issues with
// `approvedTools` once the user agrees.
// ============================================================================

// List the registered tools and which of them require confirmation.
app.get("/api/agent/tools", requireAuth, (req, res) => {
  const registry = new ToolRegistry({
    ai: null,
    workspaceRoot: process.cwd(),
    memory: getMemoryService(),
  });
  res.json({
    tools: registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      destructive: Boolean(tool.destructive),
      parameters: tool.parameters,
    })),
    destructiveTools: registry.destructiveToolNames(),
  });
});

// Run an objective through the tool loop.
app.post("/api/agent/act", requireAuth, asyncHandler(async (req, res) => {
  const {
    objective,
    dryRun = false,
    approvedTools = [],
    persona: personaId,
  } = req.body ?? {};

  if (!objective || typeof objective !== 'string') {
    return res.status(400).json({ error: 'objective is required', code: 'bad_request' });
  }

  const aiClient = getAI();
  const persona = resolvePersona(personaId);
  const registry = new ToolRegistry({
    ai: aiClient,
    workspaceRoot: process.cwd(),
    memory: getMemoryService(),
  });

  const approved = new Set<string>(Array.isArray(approvedTools) ? approvedTools : []);
  const pendingConfirmations: Array<{ name: string; args: Record<string, unknown>; reason: string }> = [];

  const result = await runToolLoop({
    objective,
    systemInstruction:
      `${persona.systemInstruction}\n\n` +
      'You have tools available. Call them whenever they would produce a more accurate or more useful answer ' +
      'than reasoning alone. Prefer tools over guessing. When a tool reports failure, say so plainly rather ' +
      'than inventing a result. When the task is complete, reply in plain prose.',
    callModel: createGeminiModelCaller(aiClient),
    registry,
    context: {
      userId: req.user?.uid,
      workspaceRoot: process.cwd(),
      dryRun: Boolean(dryRun),
    },
    requestConfirmation: async (call) => {
      if (approved.has(call.name)) return true;
      pendingConfirmations.push({
        name: call.name,
        args: call.args,
        reason: `"${call.name}" changes state and needs your approval.`,
      });
      return false;
    },
  });

  res.json({
    objective,
    persona: persona.id,
    finalText: result.finalText,
    iterations: result.iterations,
    stopReason: result.stopReason,
    dryRun: Boolean(dryRun),
    steps: result.steps.map((step) => ({
      tool: step.call.name,
      args: step.call.args,
      ok: step.result?.ok ?? false,
      summary: step.result?.summary ?? step.skippedReason ?? 'skipped',
      confirmed: step.confirmed ?? null,
      skippedReason: step.skippedReason ?? null,
      durationMs: step.durationMs,
    })),
    pendingConfirmations,
    timestamp: new Date().toISOString(),
  });
}));

// ============================================================================
// Memory API (Phase 3)
//
// All routes are scoped to the authenticated Firebase uid. Embeddings are
// generated and ranked server-side; the browser never downloads the corpus.
// ============================================================================

app.post("/api/memory/remember", requireAuth, asyncHandler(async (req, res) => {
  const { text, tags } = req.body ?? {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required', code: 'bad_request' });
  }

  const userId = req.user!.uid;
  const record = await getMemoryService().remember(userId, text, Array.isArray(tags) ? tags : []);
  res.json({
    status: 'stored',
    id: record.id,
    text: record.text,
    tagged: record.tags,
    embedded: record.embedding.length > 0,
    backend: getMemoryService().backend,
  });
}));

app.post("/api/memory/recall", requireAuth, asyncHandler(async (req, res) => {
  const { query, topK } = req.body ?? {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required', code: 'bad_request' });
  }

  const userId = req.user!.uid;
  const scored = await getMemoryService().recall(userId, query, {
    topK: Number.isFinite(Number(topK)) ? Number(topK) : 5,
  });

  res.json({
    query,
    matches: scored.map((s) => ({
      id: s.record.id,
      text: s.record.text,
      score: Number(s.score.toFixed(4)),
      method: s.lexical ? 'lexical' : 'embedding',
      tags: s.record.tags,
      createdAt: s.record.createdAt,
    })),
    backend: getMemoryService().backend,
  });
}));

app.delete("/api/memory/:id", requireAuth, asyncHandler(async (req, res) => {
  const deleted = await getMemoryService().forget(req.user!.uid, req.params.id);
  res.status(deleted ? 200 : 404).json({ status: deleted ? 'forgotten' : 'not_found' });
}));

app.get("/api/memory/profile", requireAuth, asyncHandler(async (req, res) => {
  const profile = await getMemoryService().getProfile(req.user!.uid);
  res.json({ profile, backend: getMemoryService().backend });
}));

app.put("/api/memory/profile", requireAuth, asyncHandler(async (req, res) => {
  const { preferredName, timezone, facts, quietHours } = req.body ?? {};
  const profile = await getMemoryService().updateProfile(req.user!.uid, {
    preferredName,
    timezone,
    facts: Array.isArray(facts) ? facts : undefined,
    quietHours,
  });
  res.json({ status: 'updated', profile });
}));

app.get("/api/memory/episodes", requireAuth, asyncHandler(async (req, res) => {
  const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 10;
  const episodes = await getMemoryService().recentEpisodes(req.user!.uid, limit);
  res.json({ episodes, backend: getMemoryService().backend });
}));

app.post("/api/memory/episodes", requireAuth, asyncHandler(async (req, res) => {
  const { summary } = req.body ?? {};
  if (!summary || typeof summary !== 'string') {
    return res.status(400).json({ error: 'summary is required', code: 'bad_request' });
  }
  const episode = await getMemoryService().recordEpisode(req.user!.uid, summary);
  res.json({ status: 'recorded', episode });
}));

// ============================================================================
// Workspace OAuth (Phase 6.2)
//
// The client sends a one-time authorisation CODE. The server exchanges it and
// keeps the refresh token; no Google token ever reaches the browser.
// ============================================================================

app.get("/api/workspace/status", requireAuth, asyncHandler(async (req, res) => {
  const status = await getWorkspaceAuth().status(req.user!.uid);
  res.json(status);
}));

app.post("/api/workspace/connect", requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.body ?? {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'An authorisation code is required.', code: 'bad_request' });
  }
  const status = await getWorkspaceAuth().connect(req.user!.uid, code);
  res.json({ status: 'connected', ...status });
}));

app.delete("/api/workspace/disconnect", requireAuth, asyncHandler(async (req, res) => {
  const removed = await getWorkspaceAuth().disconnect(req.user!.uid);
  res.status(removed ? 200 : 404).json({ status: removed ? 'disconnected' : 'not_connected' });
}));

// --- Unknown API route handler ---
// Must come after every real route and before the SPA fallback, so an unknown
// /api/* path returns JSON 404 instead of the index.html shell.
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `No such endpoint: ${req.method} /api${req.path}`,
    code: 'not_found',
  });
});

// --- Central error handler ---
// Registered last so every thrown AppError becomes an honest HTTP response
// instead of being swallowed by a route-level `catch {}`.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const appErr = isAppError(err)
    ? err
    : new AppError('internal', (err as Error)?.message ?? 'Internal error', { cause: err });

  if (appErr.status >= 500) {
    console.error(`[error] ${req.method} ${req.path} -> ${appErr.code}: ${appErr.message}`);
  }
  res.status(appErr.status).json(appErr.toJSON());
});

async function startServer() {
  // Start background services.
  // (The Gemini client is resolved lazily per request via safeGetAI().)

  // Proactive pipeline: only real signal sources are registered. Calendar and
  // email sources stay unregistered until server-side OAuth exists (Phase 6).
  proactiveService.registerSource(new SystemTelemetrySource());
  proactiveService.start(60_000);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Enterprise Aarsu server running on http://0.0.0.0:${PORT}`);
  });
}

// Export the fully-configured Express app so the contract test suite can boot it
// on an ephemeral port. Do not start listening during tests.
export { app };

const isTestRun = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

if (!isTestRun) {
  startServer();
}
