/**
 * The JARVIS tool registry.
 *
 * Each capability is declared once here and used by both the conversational tool
 * loop and the HUD, so the buttons and the model can never drift apart.
 *
 * Filesystem tools are sandboxed: every path is resolved and rejected unless it
 * stays inside `workspaceRoot`.
 */

import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';
import { iotBridge } from '../iotBridge';
import type { ToolDefinition, ToolParameter, ToolResult } from './types';

/**
 * Resolves a caller-supplied path against the sandbox root.
 * Returns null when the path escapes the sandbox.
 */
export function resolveSafePath(workspaceRoot: string, requested: string): string | null {
  if (!requested || typeof requested !== 'string') return null;
  if (requested.includes('\0')) return null;

  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requested);

  if (resolved === root) return resolved;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function toGeminiParameters(parameters: readonly ToolParameter[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const parameter of parameters) {
    properties[parameter.name] = {
      type: parameter.type.toUpperCase(),
      description: parameter.description,
      ...(parameter.enum ? { enum: [...parameter.enum] } : {}),
    };
    if (parameter.required) required.push(parameter.name);
  }

  return {
    type: 'OBJECT',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export interface ToolRegistryOptions {
  ai?: GoogleGenAI | null;
  workspaceRoot: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly workspaceRoot: string;
  private readonly ai: GoogleGenAI | null;

  constructor(options: ToolRegistryOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.ai = options.ai ?? null;

    for (const tool of this.buildTools()) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Names of tools that require explicit user confirmation. */
  destructiveToolNames(): string[] {
    return this.list().filter((t) => t.destructive).map((t) => t.name);
  }

  toDeclarations(): unknown[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toGeminiParameters(tool.parameters),
    }));
  }

  // --- read-only tools -----------------------------------------------------

  private getSystemStats(): ToolDefinition {
    return {
      name: 'get_system_stats',
      description:
        'Returns real host telemetry: platform, CPU model and count, memory, load average, process uptime and Node version. Use this whenever the user asks about system health, resources or performance.',
      parameters: [],
      async execute(): Promise<ToolResult> {
        const os = await import('node:os');
        const memory = process.memoryUsage();
        const data = {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
          cpuModel: os.cpus()[0]?.model ?? 'unknown',
          cpuCount: os.cpus().length,
          loadAverage: os.loadavg().map((n) => Number(n.toFixed(2))),
          totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
          freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
          processHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          processUptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
        };
        return {
          ok: true,
          summary: `CPU ${data.cpuCount} cores, ${data.freeMemoryMb} MB free of ${data.totalMemoryMb} MB, load ${data.loadAverage.join('/')}.`,
          data,
        };
      },
    };
  }

  private listFiles(): ToolDefinition {
    return {
      name: 'list_files',
      description:
        'Lists files and directories inside the workspace sandbox. Use a relative path; the workspace root is ".".',
      parameters: [
        { name: 'path', type: 'string', description: 'Relative directory path, e.g. "src" or "."', required: true },
      ],
      async execute(args, context): Promise<ToolResult> {
        const target = resolveSafePath(context.workspaceRoot, String(args.path ?? '.'));
        if (!target) {
          return { ok: false, summary: 'Path is outside the workspace sandbox and was refused.' };
        }
        const fs = await import('node:fs/promises');
        const entries = await fs.readdir(target, { withFileTypes: true });
        const listing = entries
          .slice(0, 200)
          .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`);
        return {
          ok: true,
          summary: `${listing.length} entries in ${path.relative(context.workspaceRoot, target) || '.'}`,
          data: listing,
        };
      },
    };
  }

  private readFile(): ToolDefinition {
    return {
      name: 'read_file',
      description: 'Reads a UTF-8 text file from the workspace sandbox. Returns at most 20000 characters.',
      parameters: [
        { name: 'path', type: 'string', description: 'Relative file path inside the workspace', required: true },
      ],
      async execute(args, context): Promise<ToolResult> {
        const target = resolveSafePath(context.workspaceRoot, String(args.path ?? ''));
        if (!target) {
          return { ok: false, summary: 'Path is outside the workspace sandbox and was refused.' };
        }
        const fs = await import('node:fs/promises');
        const content = await fs.readFile(target, 'utf-8');
        const truncated = content.slice(0, 20000);
        return {
          ok: true,
          summary: `Read ${truncated.length} characters from ${args.path}.`,
          data: { path: args.path, content: truncated, truncated: content.length > truncated.length },
        };
      },
    };
  }

  private webSearch(): ToolDefinition {
    return {
      name: 'web_search',
      description:
        'Searches the live web with Google Search grounding and returns an answer plus its sources. Use for anything time-sensitive or factual.',
      parameters: [
        { name: 'query', type: 'string', description: 'The question or search query', required: true },
      ],
      async execute(args): Promise<ToolResult> {
        if (!this.ai) {
          return { ok: false, summary: 'Web search is unavailable: Gemini is not configured.' };
        }
        const response = await this.ai.models.generateContent({
          model: MODELS.chat,
          contents: String(args.query ?? ''),
          config: { tools: [{ googleSearch: {} }] },
        });

        const sources: string[] = [];
        const chunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
        if (Array.isArray(chunks)) {
          for (const chunk of chunks) {
            if (chunk?.web?.uri) sources.push(chunk.web.uri);
          }
        }
        return {
          ok: true,
          summary: response.text?.slice(0, 1200) || 'No result.',
          data: { sources },
        };
      },
    };
  }

  private runCode(): ToolDefinition {
    return {
      name: 'run_code',
      description:
        'Runs a numerical or algorithmic computation in a sandboxed Python runtime. Use for maths, simulations and data transformation.',
      parameters: [
        { name: 'prompt', type: 'string', description: 'The computation or algorithm to perform', required: true },
      ],
      async execute(args): Promise<ToolResult> {
        if (!this.ai) {
          return { ok: false, summary: 'Code execution is unavailable: Gemini is not configured.' };
        }
        const response = await this.ai.models.generateContent({
          model: MODELS.chat,
          contents: String(args.prompt ?? ''),
          config: { tools: [{ codeExecution: {} }] },
        });
        return { ok: true, summary: response.text?.slice(0, 1200) || 'Computation produced no output.' };
      },
    };
  }

  // --- destructive tools (require confirmation) -----------------------------

  private writeFile(): ToolDefinition {
    return {
      name: 'write_file',
      description:
        'Writes (or overwrites) a UTF-8 text file inside the workspace sandbox. Requires user confirmation.',
      destructive: true,
      parameters: [
        { name: 'path', type: 'string', description: 'Relative file path inside the workspace', required: true },
        { name: 'content', type: 'string', description: 'Full file content to write', required: true },
      ],
      async execute(args, context): Promise<ToolResult> {
        const target = resolveSafePath(context.workspaceRoot, String(args.path ?? ''));
        if (!target) {
          return { ok: false, summary: 'Path is outside the workspace sandbox and was refused.' };
        }
        const content = String(args.content ?? '');
        if (context.dryRun) {
          return { ok: true, summary: `Dry run: would write ${content.length} characters to ${args.path}.` };
        }
        const fs = await import('node:fs/promises');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, 'utf-8');
        return { ok: true, summary: `Wrote ${content.length} characters to ${args.path}.` };
      },
    };
  }

  private controlDevice(): ToolDefinition {
    return {
      name: 'control_device',
      description:
        'Controls a smart-facility device (lighting, climate, security, power). Requires user confirmation. NOTE: devices are currently simulated in-process, not real hardware.',
      destructive: true,
      parameters: [
        { name: 'deviceId', type: 'string', description: 'Device id, e.g. dev_light_lab', required: true },
        { name: 'state', type: 'object', description: 'Key/value pairs to set, e.g. { "power": false }', required: true },
      ],
      async execute(args): Promise<ToolResult> {
        try {
          const updated = iotBridge.updateDeviceState(String(args.deviceId), args.state ?? {});
          return {
            ok: true,
            summary: `${updated.name} updated (simulated device).`,
            data: updated.state,
          };
        } catch (err) {
          return { ok: false, summary: (err as Error).message };
        }
      },
    };
  }

  private buildTools(): ToolDefinition[] {
    return [
      this.getSystemStats(),
      this.listFiles(),
      this.readFile(),
      this.webSearch(),
      this.runCode(),
      this.writeFile(),
      this.controlDevice(),
    ];
  }
}
