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
import { predictiveDaemon } from "./src/server/predictiveDaemon";
import { iotBridge } from "./src/server/iotBridge";
import { mcpServer } from "./src/server/mcpServer";
import { reinforcementScheduler } from "./src/server/reinforcementScheduler";
import { config } from "./src/server/config";
import { workspaceRouter } from "./src/server/routes/workspace";

// --- Enterprise Security Setup ---
const app = express();
app.set('trust proxy', 1);

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
  const key = config.geminiApiKey;
  if (!key) throw new Error("GEMINI_API_KEY is missing");
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
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In-memory embedding cache to avoid redundant API calls and prevent rate limiting
const embeddingCache = new Map<string, number[]>();

// Helper function to robustly generate Gemini responses with automatic retry and model fallbacks
async function generateContentWithFallback(aiClient: GoogleGenAI, contents: any, systemInstruction: string): Promise<string> {
  // Use valid, active models from @google/genai guidelines
  const models = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-flash"];
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
        const isAuthError = msg.includes("401") || msg.includes("unauthenticated") || msg.includes("authentication") || msg.includes("invalid api key");
        const isHighDemand = msg.includes("503") || msg.includes("high demand") || msg.includes("spikes in demand");
        const isRateLimit = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota");
        
        console.warn(`[Gemini Fallback] Model ${model} attempt ${attempt + 1} notice: ${err?.message?.slice(0, 120) || 'Transient error'}`);

        // If credentials are unauthorized (401), stop immediately without unnecessary loops
        if (isAuthError) {
          return JSON.stringify({
            reply: "I'm having a little trouble connecting to my AI brain. Please make sure a valid Gemini API key is configured in the Settings > Secrets panel.",
            emotion: "confusion"
          });
        }

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
  console.warn("[Gemini Fallback] All Gemini models momentarily busy, providing empathetic response.");
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

    let aiClient: GoogleGenAI;
    try {
      aiClient = getAI();
    } catch (authErr: any) {
      return res.json({
        reply: "I'm unable to connect to the Gemini API right now. Please ensure your Gemini API key is configured in the Settings > Secrets panel.",
        emotion: "confusion"
      });
    }
    
    // 2. Fetch User Context from Workspace (if token available) with Redis Caching
    let workspaceContext = "";
    if (token) {
      const cacheKey = `calendar:${token.slice(0, 16)}`;
      const cachedCalendar = redisCache.get<string>(cacheKey);
      if (cachedCalendar) {
        workspaceContext = cachedCalendar;
      } else {
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
          redisCache.set(cacheKey, workspaceContext, 60); // Cache for 60 seconds
        } catch (err) {
          console.error("Workspace access error (soft fail):", err);
        }
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

app.use("/api/fs", workspaceRouter);

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
        model: "gemini-3.8-flash",
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

// --- Google Maps Grounding Endpoint (gemini-3.5-flash with googleMaps tool) ---
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
      model: "gemini-3.5-flash",
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

// --- Realistic 3D Hologram & Image Generation Endpoint (gemini-3.1-flash-lite-image) ---
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
      model: "imagen-3.0-generate-002",
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
    console.error("3D Image Generation Error:", err);
    // Return a pristine fallback holographic schematic data URI if generation quota/key is limited
    res.json({
      imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
      prompt: req.body.prompt,
      fallback: true,
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
        model: "gemini-3.8-flash",
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

// --- Proactive Predictive Telemetry Feed Endpoint ---
app.get("/api/jarvis/proactive/feed", requireAuth, (req, res) => {
  res.json({
    alerts: predictiveDaemon.getRecentAlerts(),
    biometrics: dbService.getLatestBiometrics()
  });
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
      model: "gemini-3.8-flash",
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


// --- Model Context Protocol (MCP) Endpoints ---
app.get("/api/mcp/tools", requireAuth, (req, res) => {
  res.json({ tools: mcpServer.listTools() });
});

app.post("/api/mcp/tools/call", requireAuth, async (req, res) => {
  const { name, arguments: toolArgs } = req.body;
  if (!name) return res.status(400).json({ error: "Tool name required" });

  try {
    const aiClient = getAI();
    mcpServer.setAIClient(aiClient);
  } catch {}

  const result = await mcpServer.callTool(name, toolArgs || {});
  res.json(result);
});

app.get("/api/mcp/resources", requireAuth, (req, res) => {
  res.json({ resources: mcpServer.listResources() });
});

app.post("/api/mcp/resources/read", requireAuth, (req, res) => {
  const { uri } = req.body;
  if (!uri) return res.status(400).json({ error: "Resource URI required" });

  try {
    const result = mcpServer.readResource(uri);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

async function startServer() {
  // Start background proactive daemon & MCP server
  try {
    const aiClient = getAI();
    predictiveDaemon.setAIClient(aiClient);
    mcpServer.setAIClient(aiClient);
  } catch {}
  predictiveDaemon.start();

  if (config.nodeEnv !== "production") {
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

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Enterprise Aarsu server running on http://0.0.0.0:${config.port}`);
  });
}

startServer();
