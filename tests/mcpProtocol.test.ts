import { describe, it, expect, vi } from 'vitest';
import {
  JSON_RPC_ERRORS,
  LATEST_PROTOCOL_VERSION,
  McpProtocol,
  SERVER_NAME,
  SUPPORTED_PROTOCOL_VERSIONS,
  expectsResponse,
  toMcpInputSchema,
  validateEnvelope,
  type McpProtocolDeps,
} from '../src/server/mcp/protocol';
import type { ToolDefinition } from '../src/server/tools/types';

const listFiles: ToolDefinition = {
  name: 'list_files',
  description: 'Lists files.',
  parameters: [
    { name: 'path', type: 'string', description: 'Directory', required: true },
    { name: 'depth', type: 'number', description: 'Depth' },
  ],
  execute: async () => ({ ok: true, summary: 'listed' }),
};

const writeFile: ToolDefinition = {
  name: 'write_file',
  description: 'Writes a file.',
  destructive: true,
  parameters: [{ name: 'path', type: 'string', description: 'File', required: true }],
  execute: async () => ({ ok: true, summary: 'wrote' }),
};

function deps(overrides: Partial<McpProtocolDeps> = {}): McpProtocolDeps {
  return {
    listTools: () => [listFiles, writeFile],
    callTool: vi.fn(async (name: string) =>
      name === 'list_files'
        ? { ok: true, summary: '3 entries', data: { count: 3 } }
        : { ok: false, summary: `Unknown tool: ${name}` }
    ),
    listResources: () => [
      { uri: 'jarvis://system/telemetry', name: 'Host telemetry', description: 'x', mimeType: 'application/json' },
    ],
    readResource: async (uri) => {
      if (uri !== 'jarvis://system/telemetry') throw new Error(`Unknown resource URI: ${uri}`);
      return { uri, mimeType: 'application/json', text: '{"ok":true}' };
    },
    context: () => ({ workspaceRoot: '/workspace', dryRun: false, userId: 'u1' }),
    ...overrides,
  };
}

const req = (method: string, params?: Record<string, any>, id: string | number | null = 1) => ({
  jsonrpc: '2.0' as const,
  id,
  method,
  params,
});

describe('validateEnvelope', () => {
  it('accepts a well-formed request', () => {
    const result = validateEnvelope({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(result.status).toBe('ok');
  });

  it('rejects a non-object', () => {
    expect(validateEnvelope('hello').status).toBe('error');
    expect(validateEnvelope(null).status).toBe('error');
    expect(validateEnvelope([1, 2]).status).toBe('error');
  });

  it('rejects a wrong jsonrpc version', () => {
    const result = validateEnvelope({ jsonrpc: '1.0', method: 'ping' });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.reason).toContain('"2.0"');
  });

  it('rejects a missing or empty method', () => {
    expect(validateEnvelope({ jsonrpc: '2.0' }).status).toBe('error');
    expect(validateEnvelope({ jsonrpc: '2.0', method: '' }).status).toBe('error');
  });

  it('rejects non-object params', () => {
    expect(validateEnvelope({ jsonrpc: '2.0', method: 'x', params: 'nope' }).status).toBe('error');
  });

  it('accepts a notification (no id)', () => {
    expect(validateEnvelope({ jsonrpc: '2.0', method: 'notifications/initialized' }).status).toBe('ok');
  });
});

describe('expectsResponse', () => {
  it('is true when an id is present', () => {
    expect(expectsResponse({ jsonrpc: '2.0', id: 1, method: 'x' })).toBe(true);
    expect(expectsResponse({ jsonrpc: '2.0', id: 'a', method: 'x' })).toBe(true);
  });

  it('is false for notifications', () => {
    expect(expectsResponse({ jsonrpc: '2.0', method: 'x' })).toBe(false);
    expect(expectsResponse({ jsonrpc: '2.0', id: null, method: 'x' })).toBe(false);
  });
});

describe('toMcpInputSchema', () => {
  it('converts parameters into a JSON schema', () => {
    const schema = toMcpInputSchema(listFiles) as any;
    expect(schema.type).toBe('object');
    expect(schema.properties.path.type).toBe('string');
    expect(schema.properties.depth.type).toBe('number');
    expect(schema.required).toEqual(['path']);
  });

  it('omits required when nothing is required', () => {
    const schema = toMcpInputSchema({ ...listFiles, parameters: [] }) as any;
    expect(schema.required).toBeUndefined();
  });
});

describe('McpProtocol handle', () => {
  it('answers initialize and negotiates a supported protocol version', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('initialize', { protocolVersion: '2025-03-26' }));

    expect(response).not.toBeNull();
    const result = (response as any).result;
    expect(result.protocolVersion).toBe('2025-03-26');
    expect(result.serverInfo.name).toBe(SERVER_NAME);
    expect(result.capabilities.tools).toBeDefined();
    expect(protocol.isInitialized).toBe(true);
  });

  it('falls back to the latest version for an unsupported one', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('initialize', { protocolVersion: '1999-01-01' }));
    expect((response as any).result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('advertises every supported protocol version', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS.length).toBeGreaterThanOrEqual(3);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(LATEST_PROTOCOL_VERSION);
  });

  it('returns no response for notifications', async () => {
    const protocol = new McpProtocol(deps());
    expect(await protocol.handle(req('notifications/initialized', undefined, null))).toBeNull();
    expect(await protocol.handle(req('notifications/cancelled', undefined, null))).toBeNull();
  });

  it('answers ping', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('ping'));
    expect((response as any).result).toEqual({});
  });

  it('lists tools with input schemas and destructive annotations', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('tools/list'));
    const tools = (response as any).result.tools;

    expect(tools).toHaveLength(2);
    const write = tools.find((t: any) => t.name === 'write_file');
    expect(write.annotations.destructiveHint).toBe(true);
    expect(write.annotations.readOnlyHint).toBe(false);

    const list = tools.find((t: any) => t.name === 'list_files');
    expect(list.annotations.readOnlyHint).toBe(true);
  });

  it('calls a tool and wraps the result as MCP content', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('tools/call', { name: 'list_files', arguments: { path: '.' } }));

    const result = (response as any).result;
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('3 entries');
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ count: 3 });
  });

  it('marks a failed tool call as an error but still returns content', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('tools/call', { name: 'nope', arguments: {} }));

    const result = (response as any).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('rejects tools/call without a name', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('tools/call', {}));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
  });

  it('lists and reads resources', async () => {
    const protocol = new McpProtocol(deps());

    const listed = await protocol.handle(req('resources/list'));
    expect((listed as any).result.resources).toHaveLength(1);

    const read = await protocol.handle(req('resources/read', { uri: 'jarvis://system/telemetry' }));
    expect((read as any).result.contents[0].text).toBe('{"ok":true}');
  });

  it('reports an unknown resource as an error', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('resources/read', { uri: 'jarvis://nope' }));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
  });

  it('rejects resources/read without a uri', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('resources/read', {}));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
  });

  it('returns an empty prompt list', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('prompts/list'));
    expect((response as any).result.prompts).toEqual([]);
  });

  it('returns method-not-found for an unknown method', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('does/not/exist'));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  });

  it('swallows an unknown method when it is a notification', async () => {
    const protocol = new McpProtocol(deps());
    expect(await protocol.handle(req('does/not/exist', undefined, null))).toBeNull();
  });

  it('converts a thrown dependency error into an internal error', async () => {
    const protocol = new McpProtocol(
      deps({
        listTools: () => {
          throw new Error('registry exploded');
        },
      })
    );
    const response = await protocol.handle(req('tools/list'));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.INTERNAL_ERROR);
  });

  it('preserves the request id on the response', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handle(req('ping', undefined, 'abc-123'));
    expect((response as any).id).toBe('abc-123');
  });
});

describe('McpProtocol handleRaw', () => {
  it('returns a parse error for invalid JSON', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handleRaw('{not json');
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.PARSE_ERROR);
    expect((response as any).id).toBeNull();
  });

  it('returns an invalid-request error for a bad envelope', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handleRaw(JSON.stringify({ jsonrpc: '1.0', id: 7, method: 'ping' }));
    expect((response as any).error.code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
    expect((response as any).id).toBe(7);
  });

  it('handles a valid request end to end', async () => {
    const protocol = new McpProtocol(deps());
    const response = await protocol.handleRaw(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    );
    expect((response as any).result.serverInfo.name).toBe(SERVER_NAME);
  });
});
