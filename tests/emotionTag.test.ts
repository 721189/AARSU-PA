import { describe, it, expect } from 'vitest';
import {
  EMOTIONS,
  STREAM_EMOTION_INSTRUCTION,
  parseEmotionTag,
} from '../src/server/voice/emotionTag';

describe('parseEmotionTag', () => {
  it('extracts a complete tag and returns the prose after it', () => {
    const result = parseEmotionTag('[[emotion:happiness]]Good evening, Sir.');
    expect(result.resolved).toBe(true);
    expect(result.emotion).toBe('happiness');
    expect(result.rest).toBe('Good evening, Sir.');
  });

  it('waits while the tag is still incomplete', () => {
    expect(parseEmotionTag('[[').resolved).toBe(false);
    expect(parseEmotionTag('[[emotion').resolved).toBe(false);
    expect(parseEmotionTag('[[emotion:happ').resolved).toBe(false);
  });

  it('waits when the buffer is a prefix of the tag', () => {
    expect(parseEmotionTag('[[emot').resolved).toBe(false);
  });

  it('resolves immediately when there is no tag at all', () => {
    const result = parseEmotionTag('Good evening, Sir.');
    expect(result.resolved).toBe(true);
    expect(result.emotion).toBeUndefined();
    expect(result.rest).toBe('Good evening, Sir.');
  });

  it('defaults an unknown emotion to neutral', () => {
    expect(parseEmotionTag('[[emotion:bogus]]Hello.').emotion).toBe('neutral');
  });

  it('is case and whitespace insensitive', () => {
    expect(parseEmotionTag('[[emotion: EXCITEMENT ]]Ready.').emotion).toBe('excitement');
  });

  it('gives up on an implausibly long unterminated tag', () => {
    const long = '[[emotion:' + 'x'.repeat(200);
    const result = parseEmotionTag(long);
    expect(result.resolved).toBe(true);
    expect(result.rest).toBe(long);
  });

  it('parses correctly when fed one character at a time', () => {
    const full = '[[emotion:curiosity]]Interesting. Let me look.';
    let buffer = '';
    let emotion: string | undefined;
    let emitted = '';
    let resolved = false;

    for (const char of full) {
      if (resolved) {
        emitted += char;
        continue;
      }
      buffer += char;
      const parsed = parseEmotionTag(buffer);
      if (parsed.resolved) {
        resolved = true;
        emotion = parsed.emotion;
        emitted += parsed.rest;
        buffer = '';
      }
    }

    expect(resolved).toBe(true);
    expect(emotion).toBe('curiosity');
    expect(emitted).toBe('Interesting. Let me look.');
  });

  it('lists every emotion in the instruction', () => {
    for (const emotion of EMOTIONS) {
      expect(STREAM_EMOTION_INSTRUCTION).toContain(emotion);
    }
  });
});
