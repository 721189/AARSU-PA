import { describe, it, expect, vi } from 'vitest';
import { runToolLoop, type ToolLookup } from '../src/server/tools/toolLoop';
import type {
  ModelCallParams,
  ModelTurn,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '../src/server/tools/types';

const context: ToolContext = { workspaceRoot: '/workspace', dryRun: false };

/** Builds a registry from a list of definitions. */
function registryOf(definitions: ToolDefinition[]): ToolLookup {
  const map = new Map(definitions.map((d) => [d.name, d]));
  return {
    get: (name) => map.get(name),
    toDeclarations: () => definitions.map((d) => ({ name: d.name, description: d.description })),
  };
}

function tool(name: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    parameters: [],
    execute: async (): Promise<ToolResult> => ({ ok: true, summary: `${name} ran` }),
    ...overrides,
  };
}

/** A model that plays back a scripted list of turns, recording what it was sent. */
function scriptedModel(turns: ModelTurn[]) {
  const seen: ModelCallParams[] = [];
  let index = 0;
  const caller = async (params: ModelCallParams): Promise<ModelTurn> => {
    seen.push(params);
    const turn = turns[index] ?? { text: 'done', toolCalls: [] };
    index++;
    return turn;
  };
  return { caller, seen, calls: () => index };
}

const baseOptions = {
  objective: 'Check the reactor',
  systemInstruction: 'You are JARVIS.',
  context,
};

describe('runToolLoop', () => {
  it('returns the final text when the model calls no tools', async () => {
    const model = scriptedModel([{ text: 'All systems nominal, Sir.', toolCalls: [] }]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([]),
    });

    expect(result.finalText).toBe('All systems nominal, Sir.');
    expect(result.steps).toEqual([]);
    expect(result.iterations).toBe(1);
    expect(result.stopReason).toBe('completed');
  });

  it('executes a read-only tool and feeds the result back to the model', async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ ok: true, summary: '12 cores' }));
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'get_system_stats', args: {} }] },
      { text: 'You have 12 cores, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('get_system_stats', { execute })]),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(2);
    expect(result.finalText).toBe('You have 12 cores, Sir.');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].result?.ok).toBe(true);

    // The second model turn must have received the function response.
    const secondContents = JSON.stringify(model.seen[1].contents);
    expect(secondContents).toContain('functionResponse');
    expect(secondContents).toContain('12 cores');
  });

  it('passes the tool declarations to the model', async () => {
    const model = scriptedModel([{ text: 'ok', toolCalls: [] }]);
    await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('a'), tool('b')]),
    });
    expect(model.seen[0].declarations).toHaveLength(2);
  });

  it('denies a destructive tool when no confirmation handler is supplied', async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ ok: true, summary: 'wrote' }));
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'write_file', args: { path: 'a.txt', content: 'x' } }] },
      { text: 'Understood, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('write_file', { destructive: true, execute })]),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.steps[0].skippedReason).toBe('confirmation_denied');
    expect(result.steps[0].confirmed).toBe(false);

    const fedBack = JSON.stringify(model.seen[1].contents);
    expect(fedBack).toContain('not approved');
  });

  it('executes a destructive tool once the user approves it', async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ ok: true, summary: 'wrote 5 bytes' }));
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'write_file', args: { path: 'a.txt', content: 'hello' } }] },
      { text: 'File written, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('write_file', { destructive: true, execute })]),
      requestConfirmation: async () => true,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.steps[0].confirmed).toBe(true);
    expect(result.finalText).toBe('File written, Sir.');
  });

  it('does not execute a destructive tool the user rejects', async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ ok: true, summary: 'wrote' }));
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'write_file', args: { path: 'a.txt', content: 'x' } }] },
      { text: 'Cancelled.', toolCalls: [] },
    ]);

    await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('write_file', { destructive: true, execute })]),
      requestConfirmation: async () => false,
    });

    expect(execute).not.toHaveBeenCalled();
  });

  it('reports an unknown tool back to the model instead of crashing', async () => {
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'no_such_tool', args: {} }] },
      { text: 'That tool does not exist, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([]),
    });

    expect(result.steps[0].skippedReason).toBe('unknown_tool');
    expect(result.steps[0].result?.ok).toBe(false);
    expect(result.stopReason).toBe('completed');
  });

  it('captures a throwing tool as a failed result and keeps going', async () => {
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'boom', args: {} }] },
      { text: 'The tool failed, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([
        tool('boom', {
          execute: async () => {
            throw new Error('disk on fire');
          },
        }),
      ]),
    });

    expect(result.steps[0].result?.ok).toBe(false);
    expect(result.steps[0].result?.summary).toContain('disk on fire');
    expect(result.stopReason).toBe('completed');
  });

  it('handles several tool calls in one turn', async () => {
    const model = scriptedModel([
      {
        text: '',
        toolCalls: [
          { name: 'a', args: {} },
          { name: 'b', args: {} },
        ],
      },
      { text: 'Both done.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('a'), tool('b')]),
    });

    expect(result.steps).toHaveLength(2);
    expect(result.iterations).toBe(2);
  });

  it('stops at maxIterations when the model never stops calling tools', async () => {
    const model = scriptedModel(
      Array.from({ length: 10 }, () => ({ text: '', toolCalls: [{ name: 'loop', args: {} }] }))
    );

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('loop')]),
      maxIterations: 3,
    });

    expect(result.iterations).toBe(3);
    expect(result.stopReason).toBe('max_iterations');
    expect(model.calls()).toBe(3);
  });

  it('aborts between iterations when asked to', async () => {
    let calls = 0;
    const model = scriptedModel([{ text: '', toolCalls: [{ name: 'loop', args: {} }] }]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: async (params) => {
        calls++;
        return model.caller(params);
      },
      registry: registryOf([tool('loop')]),
      isAborted: () => calls >= 1,
    });

    expect(result.stopReason).toBe('aborted');
    expect(calls).toBe(1);
  });

  it('invokes onStep for every resolved tool call', async () => {
    const onStep = vi.fn();
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'a', args: {} }, { name: 'missing', args: {} }] },
      { text: 'done', toolCalls: [] },
    ]);

    await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('a')]),
      onStep,
    });

    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('keeps the last text the model produced', async () => {
    const model = scriptedModel([
      { text: 'Thinking about it.', toolCalls: [{ name: 'a', args: {} }] },
      { text: 'Here is the answer, Sir.', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('a')]),
    });

    expect(result.finalText).toBe('Here is the answer, Sir.');
  });

  it('records how long each step took', async () => {
    const model = scriptedModel([
      { text: '', toolCalls: [{ name: 'a', args: {} }] },
      { text: 'done', toolCalls: [] },
    ]);

    const result = await runToolLoop({
      ...baseOptions,
      callModel: model.caller,
      registry: registryOf([tool('a')]),
    });

    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
