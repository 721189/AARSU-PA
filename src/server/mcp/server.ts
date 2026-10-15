/**
 * MCP server wiring: builds protocol dependencies from the real tool registry
 * and exposes resources backed by actual server state.
 */

import os from 'node:os';
import { ToolRegistry } from '../tools/registry';
import { proactiveService } from '../proactive/service';
import type { ToolContext } from '../tools/types';
import { McpProtocol, type McpResource, type McpProtocolDeps } from './protocol';

/** Resources an MCP client can read. All backed by live server state. */
export const MCP_RESOURCES: McpResource[] = [
  {
    uri: 'jarvis://system/telemetry',
    name: 'Host telemetry',
    description: 'Real CPU, memory, load average and process uptime',
    mimeType: 'application/json',
  },
  {
    uri: 'jarvis://system/tools',
    name: 'Tool catalogue',
    description: 'Registered tools and whether each one requires confirmation',
    mimeType: 'application/json',
  },
  {
    uri: 'jarvis://proactive/feed',
    name: 'Proactive alert feed',
    description: 'Alerts that passed the interruption policy',
    mimeType: 'application/json',
  },
];

export interface McpServerOptions {
  workspaceRoot: string;
  /** Builds a fresh registry (and tool context) per request. */
  buildRegistry: () => ToolRegistry;
  /** Tool context for the current caller. */
  buildContext: () => ToolContext;
}

export function createMcpProtocol(options: McpServerOptions): McpProtocol {
  const deps: McpProtocolDeps = {
    listTools: () => options.buildRegistry().list(),

    callTool: async (name, args, context) => {
      const tool = options.buildRegistry().get(name);
      if (!tool) {
        return { ok: false, summary: `Unknown tool: ${name}` };
      }
      // Destructive tools are refused over MCP: an external client cannot
      // satisfy the interactive confirmation gate, so it must not be able to
      // bypass it.
      if (tool.destructive) {
        return {
          ok: false,
          summary: `"${name}" changes state and requires interactive confirmation, which is not available over MCP.`,
        };
      }
      try {
        return await tool.execute(args ?? {}, context);
      } catch (err) {
        return { ok: false, summary: `Tool failed: ${(err as Error)?.message ?? String(err)}` };
      }
    },

    listResources: () => MCP_RESOURCES,

    readResource: async (uri) => {
      const text = await readResourceText(uri, options);
      return { uri, mimeType: 'application/json', text };
    },

    context: () => options.buildContext(),
  };

  return new McpProtocol(deps);
}

async function readResourceText(uri: string, options: McpServerOptions): Promise<string> {
  switch (uri) {
    case 'jarvis://system/telemetry': {
      const memory = process.memoryUsage();
      return JSON.stringify(
        {
          platform: os.platform(),
          arch: os.arch(),
          cpuCount: os.cpus().length,
          loadAverage: os.loadavg(),
          totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
          processHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          processUptimeSeconds: Math.floor(process.uptime()),
        },
        null,
        2
      );
    }

    case 'jarvis://system/tools': {
      const registry = options.buildRegistry();
      return JSON.stringify(
        {
          tools: registry.list().map((tool) => ({
            name: tool.name,
            description: tool.description,
            destructive: Boolean(tool.destructive),
          })),
          destructiveTools: registry.destructiveToolNames(),
        },
        null,
        2
      );
    }

    case 'jarvis://proactive/feed':
      return JSON.stringify({ alerts: proactiveService.list(20) }, null, 2);

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}
