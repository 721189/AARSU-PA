/**
 * Wake-word detection and voice-activity detection.
 *
 * Replaces the previous implementation, which was:
 *
 *     if (transcript.toLowerCase().includes('jarvis')) onWakeWordDetected();
 *
 * That fired on the word "jarvis" anywhere in any sentence (including in the
 * middle of dictating an email), and also fired on "aarsu". A wake word must
 * only trigger at the *start* of an utterance.
 *
 * The pure helpers below are unit tested; the browser engine at the bottom wires
 * them to a microphone.
 */

/** Phrases that wake the assistant. */
export const DEFAULT_WAKE_PHRASES = ['jarvis', 'hey jarvis', 'ok jarvis', 'aarsu', 'hey aarsu'] as const;

export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WakeWordMatch {
  /** The wake phrase that matched. */
  phrase: string;
  /** Everything the user said after the wake phrase (may be empty). */
  remainder: string;
}

/**
 * Detects a wake phrase **only at the start** of the utterance.
 *
 * @param transcript Raw or final speech-recognition text.
 * @param phrases    Phrases to look for; longest match wins.
 * @returns the match, or null when the utterance did not begin with a wake phrase.
 */
export function detectWakeWord(
  transcript: string,
  phrases: readonly string[] = DEFAULT_WAKE_PHRASES
): WakeWordMatch | null {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return null;

  // Word-boundary matching rather than character-offset slicing: it keeps the
  // original casing and punctuation of the command and cannot mis-slice when the
  // transcript contains punctuation or irregular spacing.
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // Longest first so "hey jarvis" wins over "jarvis".
  const ordered = [...phrases].sort((a, b) => b.length - a.length);

  for (const phrase of ordered) {
    const needle = normalizeTranscript(phrase);
    if (!needle) continue;

    const phraseWordCount = needle.split(' ').length;
    if (words.length < phraseWordCount) continue;

    const head = normalizeTranscript(words.slice(0, phraseWordCount).join(' '));
    if (head !== needle) continue;

    // The matched words carried any attached punctuation, so the remainder needs
    // no further cleaning — and its own trailing punctuation should be preserved.
    const remainder = words.slice(phraseWordCount).join(' ').trim();

    return { phrase, remainder };
  }

  return null;
}

export interface VadOptions {
  /** RMS energy (0..1) above which a frame counts as speech. */
  threshold?: number;
  /** Consecutive speech frames required to declare speech started. */
  onsetFrames?: number;
  /** Consecutive silent frames required to declare speech ended. */
  releaseFrames?: number;
}

export type VadEvent = 'speech-start' | 'speech-end';

/**
 * Small energy-based voice activity detector.
 *
 * A state machine rather than a single threshold comparison, so a door slam does
 * not open a session and a natural pause does not close one.
 */
export class VoiceActivityDetector {
  private readonly threshold: number;
  private readonly onsetFrames: number;
  private readonly releaseFrames: number;

  private speaking = false;
  private onsetCount = 0;
  private releaseCount = 0;

  constructor(options: VadOptions = {}) {
    this.threshold = options.threshold ?? 0.02;
    this.onsetFrames = options.onsetFrames ?? 3;
    this.releaseFrames = options.releaseFrames ?? 12;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Feeds one frame of RMS energy and returns an event when the state changes. */
  push(rms: number): VadEvent | null {
    const isLoud = rms >= this.threshold;

    if (!this.speaking) {
      if (isLoud) {
        this.onsetCount++;
        if (this.onsetCount >= this.onsetFrames) {
          this.speaking = true;
          this.onsetCount = 0;
          this.releaseCount = 0;
          return 'speech-start';
        }
      } else {
        this.onsetCount = 0;
      }
      return null;
    }

    if (isLoud) {
      this.releaseCount = 0;
      return null;
    }

    this.releaseCount++;
    if (this.releaseCount >= this.releaseFrames) {
      this.speaking = false;
      this.onsetCount = 0;
      this.releaseCount = 0;
      return 'speech-end';
    }
    return null;
  }

  reset(): void {
    this.speaking = false;
    this.onsetCount = 0;
    this.releaseCount = 0;
  }
}

/** Root-mean-square energy of a byte frequency/time-domain buffer, normalised to 0..1. */
export function rmsFromBytes(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}
