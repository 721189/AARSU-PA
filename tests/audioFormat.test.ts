import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PCM_FORMAT,
  base64ToBytes,
  bytesToBase64,
  parsePcmMimeType,
  pcmDurationMs,
  pcmToWav,
  ttsPartToWavDataUri,
} from '../src/server/voice/audioFormat';

/** Reads a 4-char ASCII tag from a WAV header. */
const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

describe('pcmToWav', () => {
  it('writes a valid 44-byte RIFF/WAVE header', () => {
    const pcm = new Uint8Array(1000);
    const wav = pcmToWav(pcm);

    expect(wav.byteLength).toBe(44 + 1000);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(ascii(wav, 36, 4)).toBe('data');

    expect(u32(wav, 4)).toBe(36 + 1000); // RIFF chunk size
    expect(u16(wav, 20)).toBe(1); // PCM
    expect(u16(wav, 22)).toBe(1); // mono
    expect(u32(wav, 24)).toBe(24000); // sample rate
    expect(u32(wav, 28)).toBe(24000 * 2); // byte rate = rate * channels * bytes
    expect(u16(wav, 32)).toBe(2); // block align
    expect(u16(wav, 34)).toBe(16); // bits per sample
    expect(u32(wav, 40)).toBe(1000); // data size
  });

  it('honours a non-default format', () => {
    const wav = pcmToWav(new Uint8Array(10), { sampleRate: 16000, channels: 2, bitsPerSample: 16 });
    expect(u16(wav, 22)).toBe(2);
    expect(u32(wav, 24)).toBe(16000);
    expect(u32(wav, 28)).toBe(16000 * 2 * 2);
    expect(u16(wav, 32)).toBe(4);
  });

  it('preserves the payload verbatim', () => {
    const pcm = Uint8Array.from([1, 2, 3, 4, 5]);
    const wav = pcmToWav(pcm);
    expect(Array.from(wav.subarray(44))).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles an empty payload', () => {
    const wav = pcmToWav(new Uint8Array(0));
    expect(wav.byteLength).toBe(44);
    expect(u32(wav, 40)).toBe(0);
  });
});

describe('parsePcmMimeType', () => {
  it('extracts the sample rate from the mime type', () => {
    expect(parsePcmMimeType('audio/pcm;rate=16000').sampleRate).toBe(16000);
    expect(parsePcmMimeType('audio/L16;codec=pcm;rate=48000').sampleRate).toBe(48000);
  });

  it('extracts the channel count', () => {
    expect(parsePcmMimeType('audio/pcm;rate=24000;channels=2').channels).toBe(2);
  });

  it('falls back when the mime type is missing or unhelpful', () => {
    expect(parsePcmMimeType(undefined)).toEqual(DEFAULT_PCM_FORMAT);
    expect(parsePcmMimeType('audio/pcm').sampleRate).toBe(DEFAULT_PCM_FORMAT.sampleRate);
  });
});

describe('base64 round-trip', () => {
  it('survives a round trip', () => {
    const original = Uint8Array.from([0, 1, 127, 128, 255, 42]);
    expect(Array.from(base64ToBytes(bytesToBase64(original)))).toEqual(Array.from(original));
  });

  it('handles payloads larger than the chunking threshold', () => {
    const original = new Uint8Array(70000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(original)).subarray(0, 5))).toEqual([0, 1, 2, 3, 4]);
    expect(base64ToBytes(bytesToBase64(original)).byteLength).toBe(70000);
  });
});

describe('pcmDurationMs', () => {
  it('computes duration for 24 kHz mono 16-bit', () => {
    // 24000 samples * 2 bytes = 48000 bytes per second
    expect(pcmDurationMs(48000)).toBe(1000);
    expect(pcmDurationMs(24000)).toBe(500);
  });

  it('returns 0 for a degenerate format', () => {
    expect(pcmDurationMs(100, { sampleRate: 0, channels: 0, bitsPerSample: 0 })).toBe(0);
  });
});

describe('ttsPartToWavDataUri', () => {
  it('returns null when there is no audio payload', () => {
    expect(ttsPartToWavDataUri(undefined)).toBeNull();
    expect(ttsPartToWavDataUri({ inlineData: {} })).toBeNull();
  });

  it('builds a playable wav data uri from a Gemini audio part', () => {
    const pcm = Uint8Array.from([0, 0, 1, 0, 2, 0]);
    const uri = ttsPartToWavDataUri({
      inlineData: { data: bytesToBase64(pcm), mimeType: 'audio/pcm;rate=24000' },
    });

    expect(uri).toMatch(/^data:audio\/wav;base64,/);
    const wav = base64ToBytes(uri!.split(',')[1]);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(u32(wav, 24)).toBe(24000);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
  });
});
