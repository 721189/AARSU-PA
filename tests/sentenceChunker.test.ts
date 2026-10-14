import { describe, it, expect } from 'vitest';
import { SentenceChunker, splitSentences } from '../src/server/voice/sentenceChunker';

describe('SentenceChunker', () => {
  it('emits a sentence once the terminator is disambiguated', () => {
    const c = new SentenceChunker();
    expect(c.push('The arc reactor is stable. ')).toEqual(['The arc reactor is stable.']);
    expect(c.pending).toBe('');
  });

  it('holds an incomplete sentence back', () => {
    const c = new SentenceChunker();
    expect(c.push('The arc reactor is')).toEqual([]);
    expect(c.pending).toBe('The arc reactor is');
    expect(c.push(' stable now.')).toEqual([]);
    expect(c.flush()).toEqual(['The arc reactor is stable now.']);
  });

  it('emits multiple sentences from a single delta', () => {
    const c = new SentenceChunker();
    expect(c.push('Good evening, Sir. All systems nominal. Shall I begin?')).toEqual([
      'Good evening, Sir.',
      'All systems nominal.',
    ]);
    // The final sentence is only known to be complete at end-of-stream.
    expect(c.flush()).toEqual(['Shall I begin?']);
  });

  it('reassembles sentences split across arbitrary chunk boundaries', () => {
    const c = new SentenceChunker();
    const chunks = ['Good even', 'ing, Sir. The', ' reactor is sta', 'ble. Ready.'];
    const out = chunks.flatMap((chunk) => c.push(chunk));
    expect(out).toEqual(['Good evening, Sir.', 'The reactor is stable.']);
    expect(c.flush()).toEqual(['Ready.']);
  });

  it('does not split on common abbreviations', () => {
    const c = new SentenceChunker();
    // The terminator sits at end-of-buffer, so the chunker must wait: it cannot
    // yet know whether the next character is whitespace or another word.
    expect(c.push('Contact Dr. Banner about the Mr. Stark protocol today.')).toEqual([]);
    expect(c.flush()).toEqual(['Contact Dr. Banner about the Mr. Stark protocol today.']);
  });

  it('does not split inside decimal numbers', () => {
    const c = new SentenceChunker();
    expect(c.push('Output is 3.5 gigajoules per second now.')).toEqual([]);
    expect(c.flush()).toEqual(['Output is 3.5 gigajoules per second now.']);
  });

  it('does not split before a quote or closing bracket', () => {
    const c = new SentenceChunker();
    const out = c.push('He said "reactor is stable." Then he left the lab.');
    expect(out).toEqual(['He said "reactor is stable."']);
    expect(c.flush()).toEqual(['Then he left the lab.']);
  });

  it('merges a too-short fragment into the following sentence instead of dropping it', () => {
    const c = new SentenceChunker();
    const out = c.push('Yes. The reactor is stable and holding steady.');
    expect(out).toEqual([]);
    expect(c.flush()).toEqual(['Yes. The reactor is stable and holding steady.']);
  });

  it('waits for the character after a terminator before emitting', () => {
    const c = new SentenceChunker();
    // Nothing can be emitted: the terminator is the last character so far.
    expect(c.push('All systems are nominal.')).toEqual([]);
    // The next token disambiguates it as a boundary.
    expect(c.push(' Standing by.')).toEqual(['All systems are nominal.']);
  });

  it('flush() returns the trailing partial sentence', () => {
    const c = new SentenceChunker();
    c.push('All systems nominal, Sir');
    expect(c.flush()).toEqual(['All systems nominal, Sir']);
    expect(c.flush()).toEqual([]);
  });

  it('reset() discards buffered text', () => {
    const c = new SentenceChunker();
    c.push('partial sentence in flight');
    c.reset();
    expect(c.pending).toBe('');
    expect(c.flush()).toEqual([]);
  });

  it('treats a long newline-terminated line as a boundary', () => {
    const c = new SentenceChunker();
    const out = c.push('Primary bus online\nAuxiliary bus online\n');
    expect(out).toEqual(['Primary bus online', 'Auxiliary bus online']);
  });
});

describe('splitSentences', () => {
  it('splits a full paragraph into speakable units', () => {
    const out = splitSentences('Good evening, Sir. The workshop is secure. Awaiting your orders.');
    expect(out).toEqual(['Good evening, Sir.', 'The workshop is secure.', 'Awaiting your orders.']);
  });

  it('returns a single chunk for text with no terminator', () => {
    expect(splitSentences('All systems nominal')).toEqual(['All systems nominal']);
  });

  it('returns nothing for empty or whitespace input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n  ')).toEqual([]);
  });
});
