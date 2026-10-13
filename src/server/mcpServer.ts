import { GoogleGenAI } from '@google/genai';
import { iotBridge } from './iotBridge';
import { jarvisGraph } from '../lib/knowledgeGraph';
import { redisCache } from './redisCache';
import { dbService } from './dbService';
import { IronLegionOrchestrator } from './agentOrchestrator';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
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

  constructor() {}

  public setAIClient(ai: GoogleGenAI) {
    this.ai = ai;
  }

  // MCP: tools/list
  public listTools(): McpToolDefinition[] {
    return [
      {
        name: 'google_search_grounding',
        description: 'Queries live world web intelligence using Google Search Grounding for real-time verification and source citations.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query or factual research question' }
          },
          required: ['query']
        }
      },
      {
        name: 'python_code_execution',
        description: 'Executes verified Python computational calculations, mathematical modeling, and algorithmic transformations in a sandboxed Google runtime.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The algorithm, trajectory formula, or code computation to execute' }
          },
          required: ['prompt']
        }
      },
      {
        name: 'iron_legion_swarm',
        description: 'Dispatches autonomous 3-agent swarm (Sentinel, Architect, Tactician) with automated self-healing for complex objectives.',
        inputSchema: {
          type: 'object',
          properties: {
            objective: { type: 'string', description: 'High-level mission objective to audit or analyze' }
          },
          required: ['objective']
        }
      },
      {
        name: 'knowledge_graph_query',
        description: 'Traverses the Stark associative Graph-RAG memory vault to discover relational connections between entities and past events.',
        inputSchema: {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Optional specific node ID to query neighborhood for (e.g. arc-reactor)' }
          }
        }
      },
      {
        name: 'iot_facility_control',
        description: 'Controls smart facility hardware in the Stark workshop (overhead lights, HVAC climate, armor blast doors, auxiliary power grid).',
        inputSchema: {
          type: 'object',
          properties: {
            protocol: { 
              type: 'string', 
              enum: ['tactical_lockdown', 'night_ambient', 'nominal_work'],
              description: 'Preset facility protocol to engage' 
            },
            deviceId: { type: 'string', description: 'Optional specific device ID to update' },
            state: { type: 'object', description: 'Target state key-value pairs' }
          }
        }
      },
      {
        name: 'host_os_diagnostics',
        description: 'Inspects host operating system kernel telemetry including CPU threads, memory allocation, load averages, and uptime.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'redis_cache_metrics',
        description: 'Queries operational metrics of the in-memory Redis-compatible cache engine (hit ratio, memory footprint, key counts).',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  // MCP: tools/call
  public async callTool(name: string, args: Record<string, any>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      if (name === 'google_search_grounding') {
        if (!this.ai) throw new Error("AI core unavailable");
        const response = await this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: args.query,
          config: {
            systemInstruction: "You are J.A.R.V.I.S. Provide concise, high-IQ intelligence backed by Google Search Grounding. Address user as 'Sir'.",
            tools: [{ googleSearch: {} }]
          }
        });
        return { content: [{ type: 'text', text: response.text || "No response received" }] };
      }

      if (name === 'python_code_execution') {
        if (!this.ai) throw new Error("AI core unavailable");
        const response = await this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: args.prompt,
          config: {
            systemInstruction: "You are J.A.R.V.I.S. Execute Python calculations with codeExecution. Address user as 'Sir'.",
            tools: [{ codeExecution: {} }]
          }
        });
        return { content: [{ type: 'text', text: response.text || "Calculations complete" }] };
      }

      if (name === 'iron_legion_swarm') {
        if (!this.ai) throw new Error("AI core unavailable");
        const orchestrator = new IronLegionOrchestrator(this.ai);
        const result = await orchestrator.executeMission(args.objective || 'Default system inspection');
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      if (name === 'knowledge_graph_query') {
        if (args.entityId) {
          const sub = jarvisGraph.queryAssociations(args.entityId);
          return { content: [{ type: 'text', text: JSON.stringify(sub, null, 2) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(jarvisGraph.getFullGraph(), null, 2) }] };
      }

      if (name === 'iot_facility_control') {
        if (args.protocol) {
          const msg = iotBridge.executeFacilityProtocol(args.protocol);
          return { content: [{ type: 'text', text: msg }] };
        }
        if (args.deviceId && args.state) {
          const updated = iotBridge.updateDeviceState(args.deviceId, args.state);
          return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(iotBridge.getAllDevices(), null, 2) }] };
      }

      if (name === 'host_os_diagnostics') {
        const os = await import('os');
        const mem = process.memoryUsage();
        const data = {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          uptime: os.uptime()
        };
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      if (name === 'redis_cache_metrics') {
        return { content: [{ type: 'text', text: JSON.stringify(redisCache.getMetrics(), null, 2) }] };
      }

      throw new Error(`Unknown MCP Tool: ${name}`);
    } catch (err: any) {
      return { content: [{ type: 'text', text: `MCP Execution Error: ${err.message || String(err)}` }] };
    }
  }

  // MCP: resources/list
  public listResources(): McpResourceDefinition[] {
    return [
      { uri: 'system://biometrics', name: 'Wearable Biometric Telemetry', description: 'Live heart rate, stress index, and core temperature', mimeType: 'application/json' },
      { uri: 'system://iot-facility', name: 'Smart Facility Hardware State', description: 'Full array of connected lighting, HVAC, and vault locks', mimeType: 'application/json' },
      { uri: 'system://knowledge-vault', name: 'Associative Knowledge Graph', description: 'Active Graph-RAG nodes and relation edges', mimeType: 'application/json' },
      { uri: 'system://redis-cache', name: 'In-Memory Cache Metrics', description: 'Cache hit ratios, memory, and active TTL keys', mimeType: 'application/json' }
    ];
  }

  // MCP: resources/read
  public readResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    if (uri === 'system://biometrics') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(dbService.getLatestBiometrics(), null, 2) }] };
    }
    if (uri === 'system://iot-facility') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(iotBridge.getAllDevices(), null, 2) }] };
    }
    if (uri === 'system://knowledge-vault') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(jarvisGraph.getFullGraph(), null, 2) }] };
    }
    if (uri === 'system://redis-cache') {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(redisCache.getMetrics(), null, 2) }] };
    }
    throw new Error(`Resource URI not found: ${uri}`);
  }
}

export const mcpServer = new JarvisMcpServer();
