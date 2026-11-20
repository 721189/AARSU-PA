import { GoogleGenAI } from "@google/genai";
import { getIoTBridgeForUser } from "./iotBridge";
import { jarvisGraph } from "../lib/knowledgeGraph";
import { redisCache } from "./redisCache";
import { dbService } from "./dbService";
import { IronLegionOrchestrator } from "./agentOrchestrator";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export class JarvisMcpServer {
  private ai: GoogleGenAI | null = null;

  public setAIClient(ai: GoogleGenAI) {
    this.ai = ai;
  }

  public listTools(): McpToolDefinition[] {
    return [
      {
        name: "google_search_grounding",
        description: "Search the web through Gemini Google Search grounding.",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
      },
      {
        name: "python_code_execution",
        description: "Run calculations in Google's hosted code-execution sandbox. This does not execute on the user's computer.",
        inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }
      },
      {
        name: "iron_legion_swarm",
        description: "Run three model-based analysis roles. This is advisory analysis, not a verified security scan or automatic code repair.",
        inputSchema: { type: "object", properties: { objective: { type: "string" } }, required: ["objective"] }
      },
      {
        name: "knowledge_graph_query",
        description: "Read the shared non-personal assistant architecture graph.",
        inputSchema: { type: "object", properties: { entityId: { type: "string" } } }
      },
      {
        name: "iot_facility_control",
        description: "Control simulated demo devices isolated to the authenticated user. No physical hardware is connected.",
        inputSchema: {
          type: "object",
          properties: {
            protocol: { type: "string", enum: ["tactical_lockdown", "night_ambient", "nominal_work"] },
            deviceId: { type: "string" },
            state: { type: "object" }
          }
        }
      },
      {
        name: "host_os_diagnostics",
        description: "Read server host diagnostics. This is not the user's local computer.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "redis_cache_metrics",
        description: "Read metrics for the process-local cache (not a managed Redis service).",
        inputSchema: { type: "object", properties: {} }
      }
    ];
  }

  public async callTool(
    name: string,
    args: Record<string, any>,
    userId: string
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    try {
      if (!userId) throw new Error("Authenticated user is required.");

      if (name === "google_search_grounding") {
        if (!this.ai) throw new Error("AI core unavailable");
        const response = await this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: String(args.query || ""),
          config: {
            systemInstruction: "Answer with Google Search grounding and identify limitations.",
            tools: [{ googleSearch: {} }]
          }
        });
        return { content: [{ type: "text", text: response.text || "No response received" }] };
      }

      if (name === "python_code_execution") {
        if (!this.ai) throw new Error("AI core unavailable");
        const response = await this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: String(args.prompt || ""),
          config: {
            systemInstruction: "Use Google's hosted Python code execution for calculations. Do not imply local machine execution.",
            tools: [{ codeExecution: {} }]
          }
        });
        return { content: [{ type: "text", text: response.text || "No calculation result returned." }] };
      }

      if (name === "iron_legion_swarm") {
        if (!this.ai) throw new Error("AI core unavailable");
        const orchestrator = new IronLegionOrchestrator(this.ai);
        const result = await orchestrator.executeMission(String(args.objective || "System review"));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "knowledge_graph_query") {
        const graph = args.entityId
          ? jarvisGraph.queryAssociations(String(args.entityId))
          : jarvisGraph.getFullGraph();
        return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
      }

      if (name === "iot_facility_control") {
        const bridge = getIoTBridgeForUser(userId);
        if (args.protocol) {
          const result = bridge.executeFacilityProtocol(String(args.protocol));
          return { content: [{ type: "text", text: result }] };
        }
        if (args.deviceId && args.state && typeof args.state === "object") {
          const updated = bridge.updateDeviceState(String(args.deviceId), args.state);
          return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(bridge.getAllDevices(), null, 2) }] };
      }

      if (name === "host_os_diagnostics") {
        const os = await import("os");
        const memory = process.memoryUsage();
        const diagnostics = {
          platform: os.platform(),
          arch: os.arch(),
          cpuCount: os.cpus().length,
          totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          uptimeSeconds: Math.floor(os.uptime()),
          nodeVersion: process.version
        };
        return { content: [{ type: "text", text: JSON.stringify(diagnostics, null, 2) }] };
      }

      if (name === "redis_cache_metrics") {
        return { content: [{ type: "text", text: JSON.stringify(redisCache.getMetrics(), null, 2) }] };
      }

      throw new Error("Unknown tool: " + name);
    } catch (error: any) {
      return { content: [{ type: "text", text: "MCP Execution Error: " + (error?.message || String(error)) }] };
    }
  }

  public listResources(): McpResourceDefinition[] {
    return [
      { uri: "system://biometrics", name: "User Biometric Telemetry", description: "This user's simulated or user-reported telemetry", mimeType: "application/json" },
      { uri: "system://iot-facility", name: "Simulated Demo Devices", description: "This user's simulated demo device state", mimeType: "application/json" },
      { uri: "system://knowledge-vault", name: "Assistant Architecture Graph", description: "Non-personal assistant architecture relationships", mimeType: "application/json" },
      { uri: "system://redis-cache", name: "Process-local Cache Metrics", description: "This server process's in-memory cache metrics", mimeType: "application/json" }
    ];
  }

  public async readResource(
    uri: string,
    userId: string
  ): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    if (!userId) throw new Error("Authenticated user is required.");
    if (uri === "system://biometrics") {
      const data = await dbService.getLatestBiometrics(userId);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }
    if (uri === "system://iot-facility") {
      const data = getIoTBridgeForUser(userId).getAllDevices();
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }
    if (uri === "system://knowledge-vault") {
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(jarvisGraph.getFullGraph(), null, 2) }] };
    }
    if (uri === "system://redis-cache") {
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(redisCache.getMetrics(), null, 2) }] };
    }
    throw new Error("Resource URI not found: " + uri);
  }
}

export const mcpServer = new JarvisMcpServer();
