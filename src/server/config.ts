export type NodeEnv = "development" | "production" | "test";

const DEFAULT_PORT = 3000;
const DEFAULT_NODE_ENV: NodeEnv = "development";

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== "string") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_PORT;
  return parsed;
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return DEFAULT_NODE_ENV;
}

export const config = {
  port: parsePort(process.env.PORT),
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  simulationMode: parseBooleanEnv(process.env.SIMULATION_MODE, true),
  enableVoice: parseBooleanEnv(process.env.ENABLE_VOICE, true),
  enableWorkspace: parseBooleanEnv(process.env.ENABLE_WORKSPACE, true),
  geminiApiKey: process.env.GEMINI_API_KEY,
};

