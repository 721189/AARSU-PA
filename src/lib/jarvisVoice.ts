/**
 * J.A.R.V.I.S. unified voice engine (browser).
 *
 * There used to be two independent speech paths — one in `App.tsx`
 * (`handleVocalize`) and a second inside `ChatInterface.tsx` with its own voice
 * presets — so the header and the chat dock spoke in different voices and the
 * "softness" controls silently did nothing to the header. This module is the
 * single path.
 *
 * Responsibilities:
 *  - stream a reply's text *and* its Gemini TTS audio over one request
 *  - schedule PCM gaplessly through an AudioContext
 *  - expose a live audio level so the avatar's mouth tracks real sound
 *  - interrupt instantly (barge-in) by aborting the request and the audio graph
 */

import { parseSse, responseTextChunks, sseJson } from './sse';
import { VoiceActivityDetector, rmsFromBytes } from './wakeWord';

export interface VoiceEngineEvents {
  /** Incremental reply text, for live display. */
  onDelta?: (text: string) => void;
  /** A complete, speakable sentence. */
  onSentence?: (text: string) => void;
  /** Emotion tag emitted by the model. */
  onEmotion?: (emotion: string) => void;
  /** True while audio is actually playing. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Normalised 0..1 output level, for visemes / reactive HUD. */
  onLevel?: (level: number) => void;
  /** The full reply text once the turn completes. */
  onDone?: (text: string) => void;
  onError?: (error: Error) => void;
}

export type AuthenticatedFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ConverseOptions extends VoiceEngineEvents {
  message: string;
  /** Base64 data URL of a webcam frame, when vision is active. */
  imageBase64?: string;
  memoryContext?: string;
  persona?: string;
  voice?: string;
  fetchImpl: AuthenticatedFetch;
}

interface AudioPayload {
  pcm: string;
  sampleRate: number;
  channels: number;
}

/** Converts little-endian 16-bit PCM into a mono Float32Array for WebAudio. */
export function pcmToFloat32(pcm: Uint8Array, channels: number): Float32Array {
  const safeChannels = Math.max(1, channels);
  const frameCount = Math.floor(pcm.byteLength / 2 / safeChannels);
  const out = new Float32Array(frameCount);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let channel = 0; channel < safeChannels; channel++) {
      sum += view.getInt16((frame * safeChannels + channel) * 2, true);
    }
    out[frame] = sum / safeChannels / 32768;
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class JarvisVoiceEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private inFlight: AbortController | null = null;
  private levelFrame: number | null = null;
  private speaking = false;
  private events: VoiceEngineEvents = {};
  /** App-wide subscribers (e.g. the header) in addition to per-call handlers. */
  private subscribers = new Set<VoiceEngineEvents>();

  /**
   * Registers long-lived handlers. Returns an unsubscribe function.
   * Used so the app shell and the chat dock observe the same speech path.
   */
  on(events: VoiceEngineEvents): () => void {
    this.subscribers.add(events);
    return () => {
      this.subscribers.delete(events);
    };
  }

  private emit<K extends keyof VoiceEngineEvents>(
    name: K,
    ...args: Parameters<NonNullable<VoiceEngineEvents[K]>>
  ): void {
    (this.events[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
    for (const subscriber of this.subscribers) {
      (subscriber[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
    }
  }

  /** Lazily creates the audio graph. Must be reached from a user gesture. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;

      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;

      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call from a click/keypress so the browser permits playback later. */
  async unlock(): Promise<void> {
    this.ensureContext();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private setSpeaking(next: boolean) {
    if (this.speaking === next) return;
    this.speaking = next;
    this.emit('onSpeakingChange', next);
    if (next) this.startLevelLoop();
    else this.stopLevelLoop();
  }

  private startLevelLoop() {
    if (this.levelFrame !== null || !this.analyser) return;
    const data = new Uint8Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      this.emit('onLevel', rmsFromBytes(data));
      this.levelFrame = requestAnimationFrame(tick);
    };
    this.levelFrame = requestAnimationFrame(tick);
  }

  private stopLevelLoop() {
    if (this.levelFrame !== null) {
      cancelAnimationFrame(this.levelFrame);
      this.levelFrame = null;
    }
    this.emit('onLevel', 0);
  }

  /** Queues one PCM fragment for gapless playback. */
  private enqueue(payload: AudioPayload) {
    const ctx = this.ensureContext();
    if (!ctx || !this.gain) return;

    const samples = pcmToFloat32(base64ToBytes(payload.pcm), payload.channels || 1);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, payload.sampleRate || 24000);
    buffer.copyToChannel(samples, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);

    // Schedule back-to-back with a small lead so there is no gap or overlap.
    const startAt = Math.max(ctx.currentTime + 0.02, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) this.setSpeaking(false);
    };

    this.activeSources.add(source);
    source.start(startAt);
    this.setSpeaking(true);
  }

  /** Interrupts playback and cancels any in-flight generation (barge-in). */
  stop(): void {
    this.inFlight?.abort();
    this.inFlight = null;

    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.setSpeaking(false);
  }

  /**
   * Sends a message and streams back text plus speech in one round trip.
   * Resolves with the full reply text.
   */
  async converse(options: ConverseOptions): Promise<string> {
    this.stop();
    this.events = options;
    this.ensureContext();

    const controller = new AbortController();
    this.inFlight = controller;
    let fullText = '';

    try {
      const response = await options.fetchImpl('/api/voice/converse/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: options.message,
          imageBase64: options.imageBase64,
          memoryContext: options.memoryContext,
          persona: options.persona,
          voice: options.voice,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail: any = await response.json().catch(() => ({}));
        throw new Error(detail?.error || `Voice request failed (${response.status})`);
      }

      for await (const event of parseSse(responseTextChunks(response))) {
        if (controller.signal.aborted) break;

        switch (event.event) {
          case 'delta': {
            const payload = sseJson<{ text: string }>(event);
            if (payload?.text) {
              fullText += payload.text;
              this.emit('onDelta', payload.text);
            }
            break;
          }
          case 'sentence': {
            const payload = sseJson<{ text: string }>(event);
            if (payload?.text) this.emit('onSentence', payload.text);
            break;
          }
          case 'emotion': {
            const payload = sseJson<{ emotion: string }>(event);
            if (payload?.emotion) this.emit('onEmotion', payload.emotion);
            break;
          }
          case 'audio': {
            const payload = sseJson<AudioPayload>(event);
            if (payload?.pcm) this.enqueue(payload);
            break;
          }
          case 'audio_error':
            // Speech failed for one sentence; the text reply is still valid.
            this.emit('onError', new Error('Speech synthesis failed for one sentence.'));
            break;
          case 'error': {
            const payload = sseJson<{ error: string }>(event);
            throw new Error(payload?.error || 'Conversation stream failed');
          }
          case 'done':
            this.emit('onDone', fullText);
            break;
          default:
            break;
        }
      }

      return fullText;
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') this.emit('onError', err as Error);
      return fullText;
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  /** Speaks arbitrary text (HUD buttons) without a model turn. */
  async speak(text: string, fetchImpl: AuthenticatedFetch, voice?: string): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.inFlight = controller;

    try {
      const response = await fetchImpl('/api/voice/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      if (!response.ok) return;

      for await (const event of parseSse(responseTextChunks(response))) {
        if (controller.signal.aborted) break;
        if (event.event === 'audio') {
          const payload = sseJson<AudioPayload>(event);
          if (payload?.pcm) this.enqueue(payload);
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') this.emit('onError', err as Error);
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  /**
   * Monitors the microphone so the user can talk over the assistant.
   * Returns a teardown function.
   */
  async monitorForBargeIn(onBargeIn: () => void, threshold = 0.04): Promise<() => void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return () => {};
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const ctx = this.ensureContext();
    if (!ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return () => {};
    }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const vad = new VoiceActivityDetector({ threshold, onsetFrames: 3, releaseFrames: 8 });
    let frame = 0;
    let running = true;

    const tick = () => {
      if (!running) return;
      analyser.getByteTimeDomainData(data);
      if (this.speaking && vad.push(rmsFromBytes(data)) === 'speech-start') {
        onBargeIn();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // already disconnected
      }
    };
  }
}

export const jarvisVoice = new JarvisVoiceEngine();
