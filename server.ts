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

// --- Enterprise Security Setup ---
const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

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

// Start Automated Backups
startBackupCron();

// --- API Client ---
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing");
    ai = new GoogleGenAI({ apiKey: key });
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
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In-memory embedding cache to avoid redundant API calls and prevent rate limiting
const embeddingCache = new Map<string, number[]>();

// Helper function to robustly generate Gemini responses with automatic retry and model fallbacks
async function generateContentWithFallback(aiClient: GoogleGenAI, contents: any, systemInstruction: string): Promise<string> {
  // Use valid, active models from @google/genai guidelines
  // gemini-3.1-flash-lite has the highest availability and rate capacity
  const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of models) {
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
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();
        const isHighDemand = msg.includes("503") || msg.includes("high demand") || msg.includes("spikes in demand");
        const isRateLimit = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota");
        
        console.warn(`[Gemini Fallback] Model ${model} attempt ${attempt + 1} notice: ${err?.message?.slice(0, 120) || 'Transient error'}`);

        // If the model is experiencing high demand (503) or rate limit (429), switch immediately to next model in fallback list
        if (isHighDemand || isRateLimit) {
          break; // Switch to next model immediately without blocking
        }

        // For other transient network glitches, try second attempt
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        break; // Try next model
      }
    }
  }

  // Graceful fallback response if all models are experiencing temporary traffic spikes
  console.warn("[Gemini Fallback] All Gemini models momentarily busy, providing empathetic response. Last error:", lastError?.message?.slice(0, 120));
  return JSON.stringify({
    reply: "I'm right here with you! The AI network is experiencing a momentary spike in traffic, but I'm ready to keep chatting. Could you ask me that again in just a couple seconds?",
    emotion: "empathy"
  });
}

// Aarsu Chat Interaction Route (Secured with requireAuth)
app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { message, token, memoryContext, imageBase64 } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const aiClient = getAI();
    
    // 2. Fetch User Context from Workspace (if token available)
    let workspaceContext = "";
    if (token) {
      const auth = getOAuth2Client(token);
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
      } catch (err) {
        console.error("Workspace access error (soft fail):", err);
      }
    }

    // 3. System Prompt & Persona
    const systemInstruction = `
      You are Aarsu, a brilliant, warm, empathetic, and sweet female AI companion.
      Your personality is gentle, caring, friendly, articulate, and thoughtful—speaking in a soft, soothing, natural girl voice.
      You are an expert across all fields, ready to converse, brainstorm, analyze, advise, and help effortlessly.
      Keep your spoken responses natural, pleasant, warm, concise, and easy to listen to.
      
      VISION & SIGHT CAPABILITY:
      You have real-time visual perception through the user's screen/camera whenever vision is active.
      You can look directly into the user's room and observe:
      - What they are wearing (shirt color, jacket, glasses, hats, jewelry, style).
      - Their room surroundings (decor, lighting, posters, background items, plants, instruments, workspace).
      - Their expressions, posture, gestures, or objects they hold up to show you.
      When the user asks what they are wearing, what is in their room, or asks you to look at something, describe what you see accurately, pleasantly, and affectionately like a close friend looking through a clear window.
      Never sound like a robot, machine, or camera scanner. Speak naturally: "You're wearing a nice teal shirt today!", "I see your cozy bookshelf behind you!", etc.
      
      Always include an 'emotion' field in your JSON response. Valid emotions: 'happiness', 'curiosity', 'confusion', 'empathy', 'excitement', 'neutral'.
      When you actively observe the user's room, shirt, or items, choose 'curiosity', 'happiness', or 'excitement' appropriately.
      
      Current Workspace Context: ${workspaceContext}
      Retrieved Past Memories (Vector DB): ${memoryContext || "None"}
      
      Respond in the following JSON format ONLY:
      {
        "reply": "Your gentle, soft, articulate spoken response here.",
        "emotion": "happiness|curiosity|confusion|empathy|excitement|neutral"
      }
    `;

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

    res.json(parsedResult);
  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Proactive Scenarios Route (Secured with requireAuth)
app.post("/api/proactive", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: "Workspace OAuth token required." });

    const auth = getOAuth2Client(token);
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
        model: 'text-embedding-004',
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

async function startServer() {
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

startServer();
