import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { requireAuth } from "../auth";
import { mcpServer } from "../mcpServer";

export function createMcpRouter(getAI: () => GoogleGenAI) {
  const mcpRouter = Router();

  mcpRouter.get("/tools", requireAuth, (_req, res) => {
    res.json({ tools: mcpServer.listTools() });
  });

  mcpRouter.post("/tools/call", requireAuth, async (req, res) => {
    const { name, arguments: toolArgs } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Tool name required." });
    }
    try {
      mcpServer.setAIClient(getAI());
    } catch {
      // Tools which do not require Gemini can still run.
    }
    const result = await mcpServer.callTool(name, toolArgs || {}, req.user!.uid);
    return res.json(result);
  });

  mcpRouter.get("/resources", requireAuth, (_req, res) => {
    res.json({ resources: mcpServer.listResources() });
  });

  mcpRouter.post("/resources/read", requireAuth, async (req, res) => {
    const { uri } = req.body || {};
    if (!uri || typeof uri !== "string") {
      return res.status(400).json({ error: "Resource URI required." });
    }
    try {
      const result = await mcpServer.readResource(uri, req.user!.uid);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ error: error?.message || "Resource not found." });
    }
  });

  return mcpRouter;
}
