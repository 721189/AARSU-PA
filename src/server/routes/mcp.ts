import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { requireAuth } from "../auth";
import { mcpServer } from "../mcpServer";

export function createMcpRouter(getAI: () => GoogleGenAI) {
  const mcpRouter = Router();

  mcpRouter.get("/tools", requireAuth, (req, res) => {
    res.json({ tools: mcpServer.listTools() });
  });

  mcpRouter.post("/tools/call", requireAuth, async (req, res) => {
    const { name, arguments: toolArgs } = req.body;
    if (!name) return res.status(400).json({ error: "Tool name required" });

    try {
      const aiClient = getAI();
      mcpServer.setAIClient(aiClient);
    } catch {}

    const result = await mcpServer.callTool(name, toolArgs || {});
    res.json(result);
  });

  mcpRouter.get("/resources", requireAuth, (req, res) => {
    res.json({ resources: mcpServer.listResources() });
  });

  mcpRouter.post("/resources/read", requireAuth, (req, res) => {
    const { uri } = req.body;
    if (!uri) return res.status(400).json({ error: "Resource URI required" });

    try {
      const result = mcpServer.readResource(uri);
      res.json(result);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  return mcpRouter;
}

