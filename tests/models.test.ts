import { describe, it, expect } from 'vitest';
import {
  MODELS,
  CHAT_MODEL_CANDIDATES,
  isAuthError,
  isModelUnavailableError,
} from '../src/server/models';

/**
 * Guards the Phase 0 fix: three model IDs had been shut down or were no longer
 * documented, and the failures were hidden behind empty catch blocks. This test
 * fails loudly if anyone reintroduces a known-dead model ID.
 */
const SHUT_DOWN_OR_UNDOCUMENTED = [
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'imagen-3.0-generate-002',
  'imagen-3.0-generate-001',
  'text-embedding-004',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-3-pro-preview',
];

describe('model registry', () => {
  it('exposes every tier the app needs', () => {
    for (const key of ['chat', 'fast', 'live', 'tts', 'ttsLite', 'embedding', 'image'] as const) {
      expect(MODELS[key], `MODELS.${key} must be set`).toBeTruthy();
    }
  });

  it('never references a shut-down or undocumented model ID', () => {
    const allIds = [
      ...Object.values(MODELS),
      ...CHAT_MODEL_CANDIDATES,
    ];
    for (const id of allIds) {
      expect(SHUT_DOWN_OR_UNDOCUMENTED, `${id} is shut down / undocumented`).not.toContain(id);
    }
  });

  it('starts the fallback chain with the primary chat model and has no duplicates', () => {
    expect(CHAT_MODEL_CANDIDATES[0]).toBe(MODELS.chat);
    expect(new Set(CHAT_MODEL_CANDIDATES).size).toBe(CHAT_MODEL_CANDIDATES.length);
    expect(CHAT_MODEL_CANDIDATES.length).toBeGreaterThanOrEqual(2);
  });

  it('classifies rate-limit and availability errors as switch-model signals', () => {
    expect(isModelUnavailableError(new Error('429 RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isModelUnavailableError(new Error('503 Service Unavailable: high demand'))).toBe(true);
    expect(isModelUnavailableError(new Error('model not found'))).toBe(true);
    expect(isModelUnavailableError(new Error('ECONNRESET'))).toBe(false);
  });

  it('classifies credential errors as non-retryable', () => {
    expect(isAuthError(new Error('401 UNAUTHENTICATED'))).toBe(true);
    expect(isAuthError(new Error('API key not valid. Please pass a valid API key.'))).toBe(true);
    expect(isAuthError(new Error('503 high demand'))).toBe(false);
  });
});
