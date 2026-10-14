/**
 * Always-on wake-word listener (browser).
 *
 * Replaces `voiceHotkeyEngine`'s `transcript.includes('jarvis')` check. Speech
 * recognition runs continuously and only the *start* of a recognised utterance
 * can trigger the wake word (see `detectWakeWord`).
 *
 * Note: this still depends on the browser SpeechRecognition API, which is
 * Chrome-family only. Swapping in a dedicated always-on engine (Porcupine, or a
 * local VAD + Live API session) is Phase 1.4's follow-up; the matching logic
 * below is engine-independent and already unit tested.
 */

import {
  DEFAULT_WAKE_PHRASES,
  detectWakeWord,
  type WakeWordMatch,
} from './wakeWord';

export interface WakeWordEngineOptions {
  phrases?: readonly string[];
  /** Fired when a wake phrase is recognised at the start of an utterance. */
  onWake: (match: WakeWordMatch) => void;
  /** Fired when the user said only the wake phrase, with no command attached. */
  onWakeAlone?: (phrase: string) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'error' | 'unsupported') => void;
  onError?: (error: Error) => void;
  /** BCP-47 language tag for recognition. */
  lang?: string;
}

export class WakeWordEngine {
  private recognition: any = null;
  private running = false;
  private readonly options: WakeWordEngineOptions;

  constructor(options: WakeWordEngineOptions) {
    this.options = options;
  }

  static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): boolean {
    if (typeof window === 'undefined') return false;

    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      this.options.onStatusChange?.('unsupported');
      return false;
    }

    if (this.recognition) {
      this.running = true;
      try {
        this.recognition.start();
        this.options.onStatusChange?.('listening');
        return true;
      } catch {
        // already started
        return true;
      }
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false; // only judge completed utterances
    recognition.lang = this.options.lang ?? 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;

        const transcript = String(result[0]?.transcript ?? '').trim();
        if (!transcript) continue;

        const match = detectWakeWord(transcript, this.options.phrases ?? DEFAULT_WAKE_PHRASES);
        if (!match) continue; // wake words mid-sentence are ignored

        if (match.remainder) {
          this.options.onWake(match);
        } else {
          this.options.onWakeAlone?.(match.phrase);
        }
      }
    };

    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are routine in continuous mode.
      const code = event?.error;
      if (code === 'no-speech' || code === 'aborted') return;
      this.options.onStatusChange?.('error');
      this.options.onError?.(new Error(`Speech recognition error: ${code}`));
    };

    recognition.onend = () => {
      // Chrome ends the session periodically; restart while we still want to listen.
      if (!this.running) {
        this.options.onStatusChange?.('idle');
        return;
      }
      try {
        recognition.start();
      } catch {
        // restart raced with a state change; ignore
      }
    };

    this.recognition = recognition;
    this.running = true;

    try {
      recognition.start();
      this.options.onStatusChange?.('listening');
      return true;
    } catch (err) {
      this.options.onStatusChange?.('error');
      this.options.onError?.(err as Error);
      return false;
    }
  }

  stop(): void {
    this.running = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // not running
      }
    }
    this.options.onStatusChange?.('idle');
  }

  destroy(): void {
    this.stop();
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition = null;
    }
  }
}
