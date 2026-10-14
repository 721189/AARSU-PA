/**
 * Tool contract for the JARVIS agency layer.
 *
 * Before this existed, every capability was reachable only by clicking a button
 * in the HUD: the conversational model had no function declarations and no tool
 * loop, so "run the diagnostics" or "email the team" could not be acted on.
 */

export type ToolParamType = 'string' | 'number' | 'boolean' | 'object';

export interface ToolParameter {
  name: string;
  type: ToolParamType;
  description: string;
  required?: boolean;
  /** Restricts the value to a fixed set. */
  enum?: readonly string[];
}

export interface ToolContext {
  /** Firebase uid of the caller, when authenticated. */
  userId?: string;
  /** All filesystem tools are sandboxed to this directory. */
  workspaceRoot: string;
  /** When true, mutating tools must describe their action without performing it. */
  dryRun: boolean;
  /** Google Workspace OAuth access token, when the user has connected it. */
  workspaceToken?: string;
}

export interface ToolResult {
  ok: boolean;
  /** Short human-readable outcome, fed back to the model. */
  summary: string;
  /** Structured payload, fed back to the model as JSON. */
  data?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: readonly ToolParameter[];
  /**
   * Destructive tools change state outside this process (writing files, sending
   * mail, toggling hardware). They must be confirmed before execution.
   */
  destructive?: boolean;
  execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

/** A function call requested by the model. */
export interface ToolCallRequest {
  /** Provider-assigned id, echoed back in the function response when present. */
  id?: string;
  name: string;
  args: Record<string, any>;
}

/** One model turn: either prose, or one or more tool calls, or both. */
export interface ModelTurn {
  text: string;
  toolCalls: ToolCallRequest[];
}

export interface ModelCallParams {
  /** Conversation so far, including prior function calls and responses. */
  contents: unknown[];
  systemInstruction: string;
  /** JSON-schema-ish declarations of the available tools. */
  declarations: unknown[];
}

export type ModelCaller = (params: ModelCallParams) => Promise<ModelTurn>;

export interface ToolExecutionStep {
  call: ToolCallRequest;
  /** Absent when the call was denied or never reached execution. */
  result?: ToolResult;
  /** True when the user approved a destructive call. */
  confirmed?: boolean;
  /** Set when the call was skipped, e.g. confirmation denied. */
  skippedReason?: string;
  durationMs: number;
}

export type ToolLoopStopReason = 'completed' | 'max_iterations' | 'aborted';

export interface ToolLoopResult {
  finalText: string;
  steps: ToolExecutionStep[];
  iterations: number;
  stopReason: ToolLoopStopReason;
}
