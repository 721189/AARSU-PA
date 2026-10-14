/**
 * Audio container helpers.
 *
 * The Gemini TTS models return raw little-endian 16-bit PCM (mono, typically
 * 24 kHz) as base64. Browsers cannot play headerless PCM via <audio>, so we wrap
 * it in a minimal WAV container.
 *
 * This module is deliberately dependency-free and pure so it can be unit tested.
 */

export interface PcmFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export const DEFAULT_PCM_FORMAT: PcmFormat = {
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
};

/**
 * Parses a Gemini audio mime type such as `audio/pcm;rate=24000` or
 * `audio/L16;codec=pcm;rate=16000` into a concrete format, falling back to the
 * supplied defaults for anything not specified.
 */
export function parsePcmMimeType(mimeType: string | undefined, fallback: PcmFormat = DEFAULT_PCM_FORMAT): PcmFormat {
  if (!mimeType) return { ...fallback };

  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const channelsMatch = /channels=(\d+)/i.exec(mimeType);

  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : fallback.sampleRate,
    channels: channelsMatch ? Number(channelsMatch[1]) : fallback.channels,
    bitsPerSample: fallback.bitsPerSample,
  };
}

/**
 * Wraps raw PCM samples in a 44-byte RIFF/WAVE header.
 *
 * @param pcm Raw interleaved PCM bytes (little-endian).
 * @param format Sample format of `pcm`.
 */
export function pcmToWav(pcm: Uint8Array, format: PcmFormat = DEFAULT_PCM_FORMAT): Uint8Array {
  const { sampleRate, channels, bitsPerSample } = format;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // chunk size = file size - 8
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(44 + dataSize);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

/** Decodes a base64 string into raw bytes without depending on Node's Buffer. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encodes raw bytes to base64 without depending on Node's Buffer. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000; // avoid blowing the argument limit on large buffers
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Converts a Gemini TTS audio part into a playable WAV data URI.
 *
 * @returns the data URI, or null when the part carries no audio payload.
 */
export function ttsPartToWavDataUri(part: { inlineData?: { data?: string; mimeType?: string } } | undefined): string | null {
  const data = part?.inlineData?.data;
  if (!data) return null;

  const format = parsePcmMimeType(part?.inlineData?.mimeType);
  const wav = pcmToWav(base64ToBytes(data), format);
  return `data:audio/wav;base64,${bytesToBase64(wav)}`;
}

/**
 * Estimates the duration in milliseconds of a PCM buffer, used to keep the
 * client's lip-sync in step with real audio rather than guessing.
 */
export function pcmDurationMs(byteLength: number, format: PcmFormat = DEFAULT_PCM_FORMAT): number {
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  if (bytesPerSecond <= 0) return 0;
  return Math.round((byteLength / bytesPerSecond) * 1000);
}
