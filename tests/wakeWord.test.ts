import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WAKE_PHRASES,
  VoiceActivityDetector,
  detectWakeWord,
  normalizeTranscript,
  rmsFromBytes,
} from '../src/lib/wakeWord';

describe('normalizeTranscript', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTranscript('  Hey,   JARVIS!  What is up? ')).toBe('hey jarvis what is up');
  });
});

describe('detectWakeWord', () => {
  it('matches a bare wake word', () => {
    expect(detectWakeWord('Jarvis')).toEqual({ phrase: 'jarvis', remainder: '' });
  });

  it('matches a wake word followed by a command', () => {
    expect(detectWakeWord('Jarvis, what is the reactor status?')).toEqual({
      phrase: 'jarvis',
      remainder: 'what is the reactor status?',
    });
  });

  it('prefers the longest matching phrase', () => {
    expect(detectWakeWord('Hey Jarvis, run diagnostics').phrase).toBe('hey jarvis');
  });

  it('does NOT match a wake word in the middle of a sentence', () => {
    // This is the exact bug the old `includes('jarvis')` check had.
    expect(detectWakeWord('I asked jarvis about it yesterday')).toBeNull();
    expect(detectWakeWord('please tell aarsu I will be late')).toBeNull();
  });

  it('does not match a word that merely contains the wake word', () => {
    expect(detectWakeWord('jarvislike behaviour detected')).toBeNull();
    expect(detectWakeWord('the jarvisons arrived')).toBeNull();
  });

  it('matches "aarsu" at the start as well', () => {
    expect(detectWakeWord('Aarsu, are you there?')).toEqual({
      phrase: 'aarsu',
      remainder: 'are you there?',
    });
  });

  it('returns null for empty or punctuation-only input', () => {
    expect(detectWakeWord('')).toBeNull();
    expect(detectWakeWord('   ')).toBeNull();
    expect(detectWakeWord('...')).toBeNull();
  });

  it('accepts a custom phrase list', () => {
    expect(detectWakeWord('computer, status', ['computer'])).toEqual({
      phrase: 'computer',
      remainder: 'status',
    });
    expect(detectWakeWord('jarvis', ['computer'])).toBeNull();
  });

  it('ships sensible default phrases', () => {
    expect(DEFAULT_WAKE_PHRASES).toContain('jarvis');
  });
});

describe('VoiceActivityDetector', () => {
  it('declares speech start only after the onset frame count', () => {
    const vad = new VoiceActivityDetector({ threshold: 0.02, onsetFrames: 3, releaseFrames: 2 });
    expect(vad.push(0.5)).toBeNull();
    expect(vad.push(0.5)).toBeNull();
    expect(vad.push(0.5)).toBe('speech-start');
    expect(vad.isSpeaking).toBe(true);
  });

  it('ignores a single loud frame (a door slam, not speech)', () => {
    const vad = new VoiceActivityDetector({ threshold: 0.02, onsetFrames: 3, releaseFrames: 2 });
    expect(vad.push(0.9)).toBeNull();
    expect(vad.push(0)).toBeNull();
    expect(vad.push(0)).toBeNull();
    expect(vad.isSpeaking).toBe(false);
  });

  it('declares speech end only after the release frame count', () => {
    const vad = new VoiceActivityDetector({ threshold: 0.02, onsetFrames: 1, releaseFrames: 3 });
    expect(vad.push(0.5)).toBe('speech-start');
    expect(vad.push(0)).toBeNull();
    expect(vad.push(0)).toBeNull();
    expect(vad.push(0)).toBe('speech-end');
    expect(vad.isSpeaking).toBe(false);
  });

  it('tolerates a brief pause without ending the utterance', () => {
    const vad = new VoiceActivityDetector({ threshold: 0.02, onsetFrames: 1, releaseFrames: 5 });
    expect(vad.push(0.5)).toBe('speech-start');
    for (let i = 0; i < 3; i++) expect(vad.push(0)).toBeNull();
    expect(vad.push(0.5)).toBeNull(); // resumed
    for (let i = 0; i < 5; i++) vad.push(0);
    expect(vad.isSpeaking).toBe(false);
  });

  it('reset() returns to the idle state', () => {
    const vad = new VoiceActivityDetector({ onsetFrames: 1 });
    vad.push(0.5);
    expect(vad.isSpeaking).toBe(true);
    vad.reset();
    expect(vad.isSpeaking).toBe(false);
  });
});

describe('rmsFromBytes', () => {
  it('returns 0 for silence (all bytes at the midpoint)', () => {
    expect(rmsFromBytes(new Uint8Array([128, 128, 128, 128]))).toBeCloseTo(0, 5);
  });

  it('returns 0 for an empty buffer', () => {
    expect(rmsFromBytes(new Uint8Array(0))).toBe(0);
  });

  it('returns a positive value for a loud signal', () => {
    expect(rmsFromBytes(new Uint8Array([0, 255, 0, 255]))).toBeGreaterThan(0.9);
  });

  it('is bounded to 0..1', () => {
    expect(rmsFromBytes(new Uint8Array([0, 255]))).toBeLessThanOrEqual(1);
  });
});
