import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "../auth";
import { config } from "../config";
import { getAssistantCapabilities } from "../assistantDomains";
import {
  approveAssistantAction,
  cancelAssistantAction,
  executeAssistantTurn,
  listPendingAssistantActions
} from "../assistantRuntime";

export function createAssistantRouter(getAI: () => GoogleGenAI) {
  const router = Router();

  router.get("/capabilities", requireAuth, (_req, res) => {
    return res.json({
      ...getAssistantCapabilities(),
      integrations: {
        googleWorkspaceEnabled: config.enableWorkspace,
        googleWorkspaceConnectedPerRequest: true
      }
    });
  });

  router.get("/actions/pending", requireAuth, async (req, res) => {
    try {
      return res.json({ actions: await listPendingAssistantActions(req.user!.uid) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Could not load pending actions." });
    }
  });

  router.post("/execute", requireAuth, async (req, res) => {
    try {
      const { message, workspaceToken, memoryContext, imageBase64, domain } = req.body || {};
      if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Message is required." });
      const token = config.enableWorkspace && typeof workspaceToken === "string" ? workspaceToken : undefined;
      const result = await executeAssistantTurn(
        getAI(), req.user!.uid, message, token,
        typeof memoryContext === "string" ? memoryContext : "",
        typeof imageBase64 === "string" ? imageBase64 : null,
        domain ?? "auto"
      );
      return res.json(result);
    } catch (error: any) {
      console.error("Assistant execution error:", error);
      return res.status(500).json({ error: error?.message || "Assistant execution failed." });
    }
  });

  router.post("/actions/:actionId/approve", requireAuth, async (req, res) => {
    try {
      if (!config.enableWorkspace) return res.status(403).json({ error: "Google Workspace actions are disabled." });
      const workspaceToken = req.body?.workspaceToken;
      if (typeof workspaceToken !== "string" || !workspaceToken) {
        return res.status(401).json({ error: "Reconnect Google Workspace before approving this action." });
      }
      const result = await approveAssistantAction(req.user!.uid, req.params.actionId, workspaceToken);
      return res.json(result);
    } catch (error: any) {
      console.error("Assistant action approval error:", error);
      return res.status(400).json({ error: error?.message || "Could not execute the approved action." });
    }
  });

  router.post("/actions/:actionId/cancel", requireAuth, async (req, res) => {
    try {
      return res.json(await cancelAssistantAction(req.user!.uid, req.params.actionId));
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Could not cancel the action." });
    }
  });

  return router;
}
