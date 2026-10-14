/**
 * The agentic tool loop.
 *
 * `model -> tool calls -> execute -> feed results back -> model -> ...` until the
 * model stops calling tools. The model caller is injected so the loop can be
 * unit tested against a scripted fake instead of a live API.
 */

import type {
  ModelCaller,
  ToolCallRequest,
  ToolContext,
  ToolExecutionStep,
  ToolLoopResult,
  ToolResult,
} from './types';

/** Minimal registry surface the loop depends on. */
export interface ToolLookup {
  get(name: string): { name: string; destructive?: boolean; execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult> } | undefined;
  toDeclarations(): unknown[];
}

export interface ToolLoopOptions {
  objective: string;
  systemInstruction: string;
  callModel: ModelCaller;
  registry: ToolLookup;
  context: ToolContext;
  /** Hard stop so a misbehaving model cannot loop forever. Default 6. */
  maxIterations?: number;
  /**
   * Approval gate for destructive tools. Return false to deny.
   * Defaults to denying, so an unconfigured deployment cannot silently send mail.
   */
  requestConfirmation?: (call: ToolCallRequest) => Promise<boolean>;
  /** Called after each tool has been resolved, for live UI feedback. */
  onStep?: (step: ToolExecutionStep) => void;
  /** Polled between iterations to support cancellation. */
  isAborted?: () => boolean;
}

/** Wraps a thrown executor error into a tool result the model can reason about. */
function errorResult(err: unknown): ToolResult {
  return {
    ok: false,
    summary: `Tool failed: ${(err as Error)?.message ?? String(err)}`,
  };
}

export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    objective,
    systemInstruction,
    callModel,
    registry,
    context,
    maxIterations = 6,
    requestConfirmation,
    onStep,
    isAborted,
  } = options;

  const contents: unknown[] = [{ role: 'user', parts: [{ text: objective }] }];
  const steps: ToolExecutionStep[] = [];
  let finalText = '';
  let iterations = 0;

  while (iterations < maxIterations) {
    if (isAborted?.()) {
      return { finalText, steps, iterations, stopReason: 'aborted' };
    }

    iterations++;
    const turn = await callModel({
      contents,
      systemInstruction,
      declarations: registry.toDeclarations(),
    });

    if (turn.text) finalText = turn.text;

    if (turn.toolCalls.length === 0) {
      return { finalText, steps, iterations, stopReason: 'completed' };
    }

    // Record the model's requested calls so the provider can match responses.
    contents.push({
      role: 'model',
      parts: turn.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } })),
    });

    const responseParts: unknown[] = [];

    for (const call of turn.toolCalls) {
      const startedAt = Date.now();
      const definition = registry.get(call.name);

      if (!definition) {
        const step: ToolExecutionStep = {
          call,
          result: { ok: false, summary: `Unknown tool: ${call.name}` },
          skippedReason: 'unknown_tool',
          durationMs: Date.now() - startedAt,
        };
        steps.push(step);
        onStep?.(step);
        responseParts.push(functionResponse(call, step.result));
        continue;
      }

      if (definition.destructive) {
        const approved = requestConfirmation ? await requestConfirmation(call) : false;
        if (!approved) {
          const step: ToolExecutionStep = {
            call,
            confirmed: false,
            skippedReason: 'confirmation_denied',
            durationMs: Date.now() - startedAt,
          };
          steps.push(step);
          onStep?.(step);
          responseParts.push(
            functionResponse(call, {
              ok: false,
              summary: `Action "${call.name}" was not approved by the user and was not performed.`,
            })
          );
          continue;
        }

        const result = await safeExecute(definition, call.args, context);
        const step: ToolExecutionStep = {
          call,
          result,
          confirmed: true,
          durationMs: Date.now() - startedAt,
        };
        steps.push(step);
        onStep?.(step);
        responseParts.push(functionResponse(call, result));
        continue;
      }

      const result = await safeExecute(definition, call.args, context);
      const step: ToolExecutionStep = { call, result, durationMs: Date.now() - startedAt };
      steps.push(step);
      onStep?.(step);
      responseParts.push(functionResponse(call, result));
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  return { finalText, steps, iterations, stopReason: 'max_iterations' };
}

async function safeExecute(
  definition: { execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult> },
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    return await definition.execute(args ?? {}, context);
  } catch (err) {
    return errorResult(err);
  }
}

function functionResponse(call: ToolCallRequest, result: ToolResult): unknown {
  return {
    functionResponse: {
      ...(call.id ? { id: call.id } : {}),
      name: call.name,
      response: {
        ok: result.ok,
        summary: result.summary,
        ...(result.data !== undefined ? { data: result.data } : {}),
      },
    },
  };
}
