/**
 * Incremental sentence chunker for streamed text.
 *
 * Why this exists: the original voice pipeline waited for the *entire* model
 * response before speaking a single word, which is the single biggest reason the
 * assistant felt slow. To start talking on the first sentence we need to split a
 * growing token stream into speakable units as it arrives.
 *
 * Pure and synchronous so it can be unit tested.
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc',
  'e.g', 'i.e', 'fig', 'approx', 'dept', 'inc', 'ltd', 'co', 'no',
]);

const TERMINATORS = new Set(['.', '!', '?', '…', '\n']);

/** Closing punctuation that belongs to the sentence that precedes it. */
const CLOSERS = /["')\]}»]/;

/**
 * Stateful chunker. Feed it deltas with `push()`, drain complete sentences, and
 * call `flush()` at end-of-stream to emit any trailing partial sentence.
 */
export class SentenceChunker {
  private buffer = '';

  /** Minimum characters before a sentence is considered speakable. */
  private readonly minLength: number;

  constructor(minLength = 12) {
    this.minLength = minLength;
  }

  /** Appends streamed text and returns any sentences that are now complete. */
  push(delta: string): string[] {
    this.buffer += delta;
    return this.drain();
  }

  /** Emits whatever remains, trimmed, as a final chunk (or nothing if empty). */
  flush(): string[] {
    const remainder = this.buffer.replace(/\s+/g, ' ').trim();
    this.buffer = '';
    return remainder.length > 0 ? [remainder] : [];
  }

  /** Discards buffered text (used when a response is interrupted). */
  reset(): void {
    this.buffer = '';
  }

  get pending(): string {
    return this.buffer;
  }

  private drain(): string[] {
    const out: string[] = [];
    let cursor = 0;
    // Text that was too short to speak on its own; merged into the next sentence
    // rather than dropped, so no words are ever lost.
    let carry = '';

    let i = 0;
    while (i < this.buffer.length) {
      const char = this.buffer[i];
      if (!TERMINATORS.has(char)) {
        i++;
        continue;
      }

      let end: number | null;

      if (char === '\n') {
        end = i + 1;
      } else {
        // Do not treat the dot in "Dr." / "e.g." as a sentence end.
        const wordBefore =
          this.buffer.slice(cursor, i).trimEnd().split(/[\s(]/).pop()?.toLowerCase() ?? '';
        if (ABBREVIATIONS.has(wordBefore)) {
          i++;
          continue;
        }

        // Do not treat the dot in "3.5" as a sentence end.
        const after = this.buffer[i + 1];
        if (char === '.' && after !== undefined && /\d/.test(after)) {
          i++;
          continue;
        }

        end = this.findBoundaryEnd(i);
        // Not enough input yet to know whether this is a boundary; wait.
        if (end === null) break;
      }

      const sentence = (carry + this.buffer.slice(cursor, end)).replace(/\s+/g, ' ').trim();
      if (sentence.length >= this.minLength) {
        out.push(sentence);
        carry = '';
      } else if (sentence.length > 0) {
        carry = sentence;
      }

      cursor = end;
      i = end;
    }

    this.buffer = (carry + this.buffer.slice(cursor)).replace(/^\s+/, '');
    return out;
  }

  /**
   * A terminator only ends a sentence if it is followed by whitespace or the end
   * of the stream, optionally after closing quotes/brackets. Returning null means
   * "not enough input yet" — the caller must wait for more text.
   */
  private findBoundaryEnd(terminatorIndex: number): number | null {
    let j = terminatorIndex + 1;
    while (j < this.buffer.length && CLOSERS.test(this.buffer[j])) {
      j++;
    }
    if (j >= this.buffer.length) return null; // closer or following char may still arrive
    if (!/\s/.test(this.buffer[j])) return null;
    return j;
  }
}

/**
 * Convenience helper for non-streamed text: splits a full response into
 * sentences so each can be synthesised and played in order.
 */
export function splitSentences(text: string, minLength = 12): string[] {
  const chunker = new SentenceChunker(minLength);
  const chunks = chunker.push(text);
  return [...chunks, ...chunker.flush()];
}
