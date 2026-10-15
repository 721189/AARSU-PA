import { describe, it, expect } from 'vitest';
import { MAX_CAPTURE_WIDTH, computeScaledDimensions } from '../src/lib/visionCapture';

describe('computeScaledDimensions', () => {
  it('leaves a small frame untouched', () => {
    expect(computeScaledDimensions(640, 480, 1024)).toEqual({ width: 640, height: 480 });
  });

  it('scales a large frame down preserving aspect ratio', () => {
    expect(computeScaledDimensions(1920, 1080, 1024)).toEqual({ width: 1024, height: 576 });
  });

  it('never upscales', () => {
    expect(computeScaledDimensions(320, 240, 1024)).toEqual({ width: 320, height: 240 });
  });

  it('scales exactly at the boundary', () => {
    expect(computeScaledDimensions(1024, 768, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it('handles a portrait frame', () => {
    expect(computeScaledDimensions(1080, 1920, 540)).toEqual({ width: 540, height: 960 });
  });

  it('never returns a zero height for an extreme aspect ratio', () => {
    const scaled = computeScaledDimensions(10000, 3, 100);
    expect(scaled.height).toBeGreaterThanOrEqual(1);
  });

  it('returns zeroes for a degenerate input', () => {
    expect(computeScaledDimensions(0, 0, 1024)).toEqual({ width: 0, height: 0 });
    expect(computeScaledDimensions(-5, 10, 1024)).toEqual({ width: 0, height: 0 });
  });

  it('uses a sane default maximum width', () => {
    expect(MAX_CAPTURE_WIDTH).toBeGreaterThanOrEqual(512);
    expect(computeScaledDimensions(4000, 2000).width).toBe(MAX_CAPTURE_WIDTH);
  });
});
