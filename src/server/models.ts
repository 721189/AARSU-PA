/**
 * Central Gemini model registry — the single source of truth for every model ID
 * used by J.A.R.V.I.S.
 *
 * Verified against https://ai.google.dev/gemini-api/docs/models and
 * https://ai.google.dev/gemini-api/docs/deprecations on 2026-10-13.
 *
 * The previous code hard-coded model IDs inline. Several had been shut down
 * (gemini-3.1-flash-lite, imagen-3.0-generate-002) or were no longer documented
 * (text-embedding-004), and every failure was swallowed by an empty `catch {}`,
 * so the features silently degraded to fake fallbacks. Do not inline model IDs
 * anywhere else — import from here.
 */

export const MODELS = {
  /** Primary reasoning / conversational model. */
  chat: 'gemini-3.8-flash',

  /**
   * Fast-tier model for sub-agents, short classifications and cheap fan-out work.
   * Replaces the shut-down `gemini-3.1-flash-lite`.
   */
  fast: 'gemini-3.6-flash',

  /** Real-time bidirectional audio model (Live API). Used by the voice loop. */
  live: 'gemini-3.8-live',

  /** High-fidelity expressive text-to-speech. */
  tts: 'gemini-3.8-flash-tts',

  /** Cheaper TTS for high-volume / cascaded playback. */
  ttsLite: 'gemini-3.8-flash-lite-tts',

  /** Text embeddings. Replaces the undocumented `text-embedding-004`. */
  embedding: 'gemini-embedding-001',

  /**
   * Image generation. Replaces `imagen-3.0-generate-002` (shut down 2025-11-10).
   * Uses the same `models.generateImages` surface as before.
   */
  image: 'imagen-4.0-generate-001',
} as const;

/**
 * Ordered fallback chain for conversational generation. The first entry is the
 * preferred model; subsequent entries are tried only when the previous one is
 * unavailable (503 / high demand) or rate limited (429).
 */
export const CHAT_MODEL_CANDIDATES: readonly string[] = [
  MODELS.chat,
  MODELS.fast,
  'gemini-3.5-flash',
];

/**
 * Returns true when an error message indicates the model itself is
 * unavailable or rate limited, in which case we should switch models
 * immediately rather than retrying the same one.
 */
export function isModelUnavailableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('spikes in demand') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('not found') ||
    msg.includes('unsupported')
  );
}

/**
 * Returns true when an error indicates bad credentials, in which case retrying
 * or falling back to another model is pointless.
 */
export function isAuthError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthenticated') ||
    msg.includes('authentication') ||
    msg.includes('invalid api key') ||
    msg.includes('permission denied') ||
    msg.includes('api key not valid')
  );
}
