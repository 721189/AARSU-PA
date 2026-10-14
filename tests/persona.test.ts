import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_PERSONA_ID,
  PERSONAS,
  buildChatSystemInstruction,
  resolvePersona,
} from '../src/server/persona';
import { DEFAULT_JARVIS_VOICE, JARVIS_VOICES, resolveVoiceName } from '../src/server/voice/tts';

describe('persona', () => {
  const originalEnv = process.env.JARVIS_PERSONA;

  beforeEach(() => {
    delete process.env.JARVIS_PERSONA;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.JARVIS_PERSONA;
    else process.env.JARVIS_PERSONA = originalEnv;
  });

  it('defaults to JARVIS, not the old companion persona', () => {
    expect(DEFAULT_PERSONA_ID).toBe('jarvis');
    expect(resolvePersona().id).toBe('jarvis');
  });

  it('addresses the user as Sir in the default instruction', () => {
    expect(resolvePersona().systemInstruction).toContain('Sir');
  });

  it('honours an explicit request over the environment', () => {
    process.env.JARVIS_PERSONA = 'jarvis';
    expect(resolvePersona('aarsu').id).toBe('aarsu');
  });

  it('honours the environment when no request is made', () => {
    process.env.JARVIS_PERSONA = 'aarsu';
    expect(resolvePersona().id).toBe('aarsu');
  });

  it('falls back to the default for an unknown persona', () => {
    expect(resolvePersona('nonsense').id).toBe(DEFAULT_PERSONA_ID);
  });

  it('exposes both personas', () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(['aarsu', 'jarvis']);
  });

  it('layers workspace and memory context onto the persona', () => {
    const instruction = buildChatSystemInstruction({
      persona: PERSONAS.jarvis,
      workspaceContext: 'Meeting at 15:00',
      memoryContext: 'Prefers brevity',
    });
    expect(instruction).toContain('Meeting at 15:00');
    expect(instruction).toContain('Prefers brevity');
    expect(instruction).toContain('Sir');
  });

  it('degrades to "None" when context is absent', () => {
    const instruction = buildChatSystemInstruction({ persona: PERSONAS.jarvis });
    expect(instruction).toContain('Workspace Context: None');
  });
});

describe('voice selection', () => {
  it('defaults to the JARVIS voice', () => {
    expect(resolveVoiceName()).toBe(DEFAULT_JARVIS_VOICE);
    expect(resolveVoiceName(undefined)).toBe(DEFAULT_JARVIS_VOICE);
  });

  it('accepts a known voice, case-insensitively', () => {
    expect(resolveVoiceName('orus')).toBe('Orus');
    expect(resolveVoiceName('ORUS')).toBe('Orus');
  });

  it('falls back to the default for an unknown voice', () => {
    expect(resolveVoiceName('definitely-not-a-voice')).toBe(DEFAULT_JARVIS_VOICE);
  });

  it('every persona default voice is a real prebuilt voice', () => {
    const names = JARVIS_VOICES.map((v) => v.name);
    for (const persona of Object.values(PERSONAS)) {
      expect(names, `${persona.id} default voice`).toContain(persona.defaultVoice);
    }
  });

  it('has unique voice names', () => {
    const names = JARVIS_VOICES.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
