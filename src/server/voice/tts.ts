import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';
import { AppError } from '../errors';
import {
  bytesToBase64,
  base64ToBytes,
  pcmDurationMs,
  pcmToWav,
  parsePcmMimeType,
  DEFAULT_PCM_FORMAT,
  type PcmFormat,
} from './audioFormat';

/**
 * Gemini text-to-speech.
 *
 * Replaces the browser's `speechSynthesis`, which produced a robotic, monotone
 * read-out and could not be interrupted mid-utterance. This service uses the
 * expressive Gemini TTS models and returns real PCM audio.
 */

export interface JarvisVoice {
  /** Prebuilt voice name passed to the API. */
  name: string;
  /** Human-readable label for the UI. */
  label: string;
  /** What the voice sounds like, for the UI. */
  style: string;
}

/**
 * Curated prebuilt voices. The default is chosen for a composed, authoritative
 * British-butler register to match the J.A.R.V.I.S. persona.
 */
export const JARVIS_VOICES: readonly JarvisVoice[] = [
  { name: 'Charon', label: 'JARVIS (default)', style: 'Informative, composed, British butler' },
  { name: 'Orus', label: 'Tactical', style: 'Firm and decisive' },
  { name: 'Iapetus', label: 'Analyst', style: 'Clear and precise' },
  { name: 'Algieba', label: 'Smooth', style: 'Warm and unhurried' },
  { name: 'Rasalgethi', label: 'Briefing', style: 'Measured, informational' },
  { name: 'Sulafat', label: 'Warm', style: 'Soft and reassuring' },
  { name: 'Achird', label: 'Friendly', style: 'Approachable and light' },
  { name: 'Kore', label: 'Alt', style: 'Neutral and even' },
];

export const DEFAULT_JARVIS_VOICE = 'Charon';

export function resolveVoiceName(requested?: string): string {
  if (!requested) return DEFAULT_JARVIS_VOICE;
  const match = JARVIS_VOICES.find((v) => v.name.toLowerCase() === requested.toLowerCase());
  return match ? match.name : DEFAULT_JARVIS_VOICE;
}

export interface SynthesizeResult {
  /** Full WAV data URI, directly playable by an <audio> element. */
  audio: string;
  sampleRate: number;
  durationMs: number;
  voiceName: string;
  model: string;
}

export interface TtsChunk {
  /** Raw little-endian PCM bytes, to be scheduled by the client's AudioContext. */
  pcm: Uint8Array;
  format: PcmFormat;
}

export class GeminiTtsService {
  private readonly ai: GoogleGenAI;

  constructor(aiClient: GoogleGenAI) {
    this.ai = aiClient;
  }

  /** One-shot synthesis. Returns a complete, playable WAV. */
  async synthesize(text: string, voiceName?: string): Promise<SynthesizeResult> {
    const voice = resolveVoiceName(voiceName);
    const clean = text.trim();
    if (!clean) {
      throw new AppError('bad_request', 'Cannot synthesise empty text.');
    }

    const response = await this.ai.models.generateContent({
      model: MODELS.tts,
      contents: clean,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    const base64 = (part as any)?.inlineData?.data as string | undefined;
    if (!base64) {
      throw new AppError('upstream_unavailable', 'TTS model returned no audio.', {
        detail: `voice=${voice} model=${MODELS.tts}`,
      });
    }

    const format = parsePcmMimeType((part as any)?.inlineData?.mimeType);
    const pcm = base64ToBytes(base64);
    const wav = pcmToWav(pcm, format);

    return {
      audio: `data:audio/wav;base64,${bytesToBase64(wav)}`,
      sampleRate: format.sampleRate,
      durationMs: pcmDurationMs(pcm.byteLength, format),
      voiceName: voice,
      model: MODELS.tts,
    };
  }

  /**
   * Streaming synthesis. Yields raw PCM fragments as the model produces them so
   * the client can begin playback almost immediately.
   */
  async *synthesizeStream(text: string, voiceName?: string): AsyncGenerator<TtsChunk> {
    const voice = resolveVoiceName(voiceName);
    const clean = text.trim();
    if (!clean) return;

    const stream = await this.ai.models.generateContentStream({
      model: MODELS.tts,
      contents: clean,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    });

    // PCM16 frames are two bytes wide; hold a stray byte so we never emit an
    // odd-length buffer that would desynchronise the client's decoder.
    let pendingByte: number | null = null;

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts as any[]) {
        const base64 = part?.inlineData?.data as string | undefined;
        if (!base64) continue;

        let bytes = base64ToBytes(base64);
        if (pendingByte !== null) {
          const merged = new Uint8Array(bytes.length + 1);
          merged[0] = pendingByte;
          merged.set(bytes, 1);
          bytes = merged;
          pendingByte = null;
        }
        if (bytes.length % 2 !== 0) {
          pendingByte = bytes[bytes.length - 1];
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        if (bytes.length === 0) continue;

        yield {
          pcm: bytes,
          format: parsePcmMimeType(part?.inlineData?.mimeType, DEFAULT_PCM_FORMAT),
        };
      }
    }

    if (pendingByte !== null) {
      yield { pcm: new Uint8Array([pendingByte]), format: DEFAULT_PCM_FORMAT };
    }
  }
}
