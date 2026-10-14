import { describe, it, expect } from 'vitest';
import { pcmToFloat32 } from '../src/lib/jarvisVoice';

/** Packs int16 samples into little-endian bytes. */
function int16Bytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  return out;
}

describe('pcmToFloat32', () => {
  it('converts a mono PCM buffer to normalised floats', () => {
    const floats = pcmToFloat32(int16Bytes([0, 32767, -32768, 16384]), 1);
    expect(floats.length).toBe(4);
    expect(floats[0]).toBeCloseTo(0, 5);
    expect(floats[1]).toBeCloseTo(32767 / 32768, 4);
    expect(floats[2]).toBeCloseTo(-1, 5);
    expect(floats[3]).toBeCloseTo(0.5, 4);
  });

  it('downmixes stereo by averaging the channels', () => {
    // Two frames: (32767, -32767) then (16384, 16384)
    const floats = pcmToFloat32(int16Bytes([32767, -32767, 16384, 16384]), 2);
    expect(floats.length).toBe(2);
    expect(floats[0]).toBeCloseTo(0, 4);
    expect(floats[1]).toBeCloseTo(0.5, 4);
  });

  it('ignores a trailing partial frame', () => {
    // 3 int16 values with channels=2 => 1 full frame, 1 stray sample
    const floats = pcmToFloat32(int16Bytes([100, 200, 300]), 2);
    expect(floats.length).toBe(1);
  });

  it('treats a zero channel count as mono rather than dividing by zero', () => {
    const floats = pcmToFloat32(int16Bytes([100, 200]), 0);
    expect(floats.length).toBe(2);
    expect(Number.isFinite(floats[0])).toBe(true);
  });

  it('returns an empty array for an empty buffer', () => {
    expect(pcmToFloat32(new Uint8Array(0), 1).length).toBe(0);
  });

  it('never produces values outside -1..1', () => {
    const floats = pcmToFloat32(int16Bytes([-32768, 32767, 0]), 1);
    for (const value of floats) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
