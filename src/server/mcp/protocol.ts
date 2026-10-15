/**
 * Model Context Protocol — JSON-RPC 2.0 server core.
 *
 * The previous "MCP hub" was a REST façade: `GET /api/mcp/tools` and
 * `POST /api/mcp/tools/call`. It had no `initialize` handshake, no protocol
 * version negotiation, no JSON-RPC envelope and no transport an MCP client could
 * speak, so no real MCP client (Claude Desktop, an IDE, another agent) could ever
 * connect to it.
 *
 * This module implements the actual protocol. `McpProtocol` is transport-free
 * and pure, so the whole protocol surface is unit testable.
 *
 * Spec: https://modelcontextprotocol.io/specification
 */

import type { ToolDefinition, ToolContext } from '../tools/types';

/** Protocol revisions this server can speak, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_NAME = 'aarsu-jarvis';
export const SERVER_VERSION = '2.0.0';

// --- JSON-RPC 2.0 ------------------------------------------------------------

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/** True when the message is a request rather than a notification. */
export function expectsResponse(message: JsonRpcRequest): boolean {
  return message.id !== undefined && message.id !== null;
}

/** Validates the JSON-RPC 2.0 envelope. */
export type EnvelopeValidation =
  | { status: 'ok'; message: JsonRpcRequest }
  | { status: 'error'; reason: string };

export function validateEnvelope(value: unknown): EnvelopeValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'error', reason: 'Request must be a JSON object.' };
  }
  const candidate = value as Record<string, unknown>;

  if (candidate.jsonrpc !== '2.0') {
    return { status: 'error', reason: 'jsonrpc must be exactly "2.0".' };
  }
  if (typeof candidate.method !== 'string' || candidate.method.length === 0) {
    return { status: 'error', reason: 'method must be a non-empty string.' };
  }
  if (candidate.params !== undefined && (typeof candidate.params !== 'object' || candidate.params === null)) {
    return { status: 'error', reason: 'params must be an object when present.' };
  }

  return { status: 'ok', message: candidate as unknown as JsonRpcRequest };
}

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpProtocolDeps {
  listTools: () => ToolDefinition[];
  callTool: (
    name: string,
    args: Record<string, any>,
    context: ToolContext
  ) => Promise<{ ok: boolean; summary: string; data?: unknown }>;
  listResources: () => McpResource[];
  readResource: (uri: string) => Promise<{ uri: string; mimeType: string; text: string }>;
  context: () => ToolContext;
}

/** Converts an internal tool definition into an MCP `inputSchema`. */
export function toMcpInputSchema(tool: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const parameter of tool.parameters) {
    properties[parameter.name] = {
      type: parameter.type === 'object' ? 'object' : parameter.type,
      description: parameter.description,
      ...(parameter.enum ? { enum: [...parameter.enum] } : {}),
    };
    if (parameter.required) required.push(parameter.name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export class McpProtocol {
  private readonly deps: McpProtocolDeps;
  private initialized = false;

  constructor(deps: McpProtocolDeps) {
    this.deps = deps;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Handles one JSON-RPC message.
   *
   * Returns `null` for notifications (which by definition have no response).
   */
  async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = !expectsResponse(message);

    try {
      switch (message.method) {
        case 'initialize': {
          const requested =
            typeof message.params?.protocolVersion === 'string'
              ? message.params.protocolVersion
              : LATEST_PROTOCOL_VERSION;

          // Negotiate: echo the client's version when we support it.
          const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION;

          this.initialized = true;

          return this.ok(message, {
            protocolVersion,
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false, subscribe: false },
              prompts: { listChanged: false },
            },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            instructions:
              'J.A.R.V.I.S. control plane. Tools are user-scoped and destructive actions are gated.',
          });
        }

        case 'notifications/initialized':
        case 'notifications/cancelled':
          return null;

        case 'ping':
          return this.ok(message, {});

        case 'tools/list':
          return this.ok(message, {
            tools: this.deps.listTools().map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: toMcpInputSchema(tool),
              annotations: {
                readOnlyHint: !tool.destructive,
                destructiveHint: Boolean(tool.destructive),
              },
            })),
          });

        case 'tools/call': {
          const name = message.params?.name;
          if (typeof name !== 'string' || !name) {
            return this.fail(message, JSON_RPC_ERRORS.INVALID_PARAMS, 'params.name is required.');
          }

          const args = (message.params?.arguments ?? {}) as Record<string, any>;
          const result = await this.deps.callTool(name, args, this.deps.context());

          return this.ok(message, {
            content: [{ type: 'text', text: result.summary }],
            ...(result.data !== undefined ? { structuredContent: result.data as Record<string, unknown> } : {}),
            isError: !result.ok,
          });
        }

        case 'resources/list':
          return this.ok(message, { resources: this.deps.listResources() });

        case 'resources/read': {
          const uri = message.params?.uri;
          if (typeof uri !== 'string' || !uri) {
            return this.fail(message, JSON_RPC_ERRORS.INVALID_PARAMS, 'params.uri is required.');
          }
          try {
            const content = await this.deps.readResource(uri);
            return this.ok(message, { contents: [content] });
          } catch (err) {
            return this.fail(message, JSON_RPC_ERRORS.INVALID_PARAMS, (err as Error).message);
          }
        }

        case 'prompts/list':
          return this.ok(message, { prompts: [] });

        default:
          if (isNotification) return null;
          return this.fail(message, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${message.method}`);
      }
    } catch (err) {
      if (isNotification) return null;
      return this.fail(message, JSON_RPC_ERRORS.INTERNAL_ERROR, (err as Error)?.message ?? 'Internal error');
    }
  }

  /** Handles a raw JSON string, including parse and envelope errors. */
  async handleRaw(raw: string): Promise<JsonRpcResponse | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: 'Invalid JSON.' },
      };
    }

    const validated = validateEnvelope(parsed);
    if (validated.status === 'error') {
      const id = (parsed as any)?.id ?? null;
      return {
        jsonrpc: '2.0',
        id,
        error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: validated.reason },
      };
    }

    return this.handle(validated.message);
  }

  private ok(message: JsonRpcRequest, result: unknown): JsonRpcSuccess {
    return { jsonrpc: '2.0', id: message.id ?? null, result };
  }

  private fail(message: JsonRpcRequest, code: number, text: string, data?: unknown): JsonRpcFailure {
    return {
      jsonrpc: '2.0',
      id: message.id ?? null,
      error: { code, message: text, ...(data !== undefined ? { data } : {}) },
    };
  }
}
