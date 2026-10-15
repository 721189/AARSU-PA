import { describe, it, expect, vi } from 'vitest';
import {
  INTERRUPTION_THRESHOLD,
  dedupeKey,
  isWithinQuietHours,
  rankCandidates,
  scoreCandidate,
  type ProactiveCandidate,
} from '../src/server/proactive/relevance';

function candidate(overrides: Partial<ProactiveCandidate> = {}): ProactiveCandidate {
  return {
    sourceKey: 'thing',
    kind: 'system',
    urgency: 'medium',
    message: 'Something happened.',
    ...overrides,
  };
}

describe('isWithinQuietHours', () => {
  it('returns false when no quiet hours are configured', () => {
    expect(isWithinQuietHours(3, null)).toBe(false);
    expect(isWithinQuietHours(3, undefined)).toBe(false);
  });

  it('handles a same-day window', () => {
    const quiet = { startHour: 9, endHour: 17 };
    expect(isWithinQuietHours(8, quiet)).toBe(false);
    expect(isWithinQuietHours(9, quiet)).toBe(true);
    expect(isWithinQuietHours(16, quiet)).toBe(true);
    expect(isWithinQuietHours(17, quiet)).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const quiet = { startHour: 23, endHour: 7 };
    expect(isWithinQuietHours(23, quiet)).toBe(true);
    expect(isWithinQuietHours(0, quiet)).toBe(true);
    expect(isWithinQuietHours(6, quiet)).toBe(true);
    expect(isWithinQuietHours(7, quiet)).toBe(false);
    expect(isWithinQuietHours(12, quiet)).toBe(false);
  });

  it('treats a zero-length window as no quiet hours', () => {
    expect(isWithinQuietHours(5, { startHour: 5, endHour: 5 })).toBe(false);
  });
});

describe('scoreCandidate', () => {
  it('delivers a high-urgency alert outside quiet hours', () => {
    const result = scoreCandidate(candidate({ urgency: 'high' }), { localHour: 12 });
    expect(result.shouldDeliver).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(INTERRUPTION_THRESHOLD);
  });

  it('withholds a low-urgency alert as below threshold', () => {
    const result = scoreCandidate(candidate({ urgency: 'low', kind: 'info' }), { localHour: 12 });
    expect(result.shouldDeliver).toBe(false);
    expect(result.withheldReason).toBe('below_threshold');
  });

  it('withholds a non-critical alert during quiet hours', () => {
    const result = scoreCandidate(candidate({ urgency: 'high' }), {
      localHour: 2,
      quietHours: { startHour: 23, endHour: 7 },
    });
    expect(result.shouldDeliver).toBe(false);
    expect(result.withheldReason).toBe('quiet_hours');
  });

  it('still delivers a critical alert during quiet hours', () => {
    const result = scoreCandidate(candidate({ urgency: 'critical', kind: 'security' }), {
      localHour: 2,
      quietHours: { startHour: 23, endHour: 7 },
    });
    expect(result.shouldDeliver).toBe(true);
  });

  it('withholds non-critical alerts in focus mode', () => {
    const result = scoreCandidate(candidate({ urgency: 'high' }), { localHour: 12, focusMode: true });
    expect(result.shouldDeliver).toBe(false);
    expect(result.withheldReason).toBe('focus_mode');
  });

  it('still delivers critical alerts in focus mode', () => {
    const result = scoreCandidate(candidate({ urgency: 'critical', kind: 'security' }), {
      localHour: 12,
      focusMode: true,
    });
    expect(result.shouldDeliver).toBe(true);
  });

  it('never repeats the same event inside the de-duplication window', () => {
    const result = scoreCandidate(candidate({ urgency: 'critical' }), {
      localHour: 12,
      minutesSinceLastDelivery: 5,
    });
    expect(result.shouldDeliver).toBe(false);
    expect(result.withheldReason).toBe('duplicate');
  });

  it('allows re-delivery once the window has passed', () => {
    const result = scoreCandidate(candidate({ urgency: 'critical' }), {
      localHour: 12,
      minutesSinceLastDelivery: 45,
    });
    expect(result.shouldDeliver).toBe(true);
  });

  it('weights security above email for the same urgency', () => {
    const security = scoreCandidate(candidate({ kind: 'security', urgency: 'medium' }), { localHour: 12 });
    const email = scoreCandidate(candidate({ kind: 'email', urgency: 'medium' }), { localHour: 12 });
    expect(security.score).toBeGreaterThan(email.score);
  });
});

describe('dedupeKey', () => {
  it('combines kind and source key', () => {
    expect(dedupeKey({ kind: 'system', sourceKey: 'heap-high' })).toBe('system:heap-high');
  });

  it('distinguishes different kinds with the same key', () => {
    expect(dedupeKey({ kind: 'system', sourceKey: 'x' })).not.toBe(dedupeKey({ kind: 'email', sourceKey: 'x' }));
  });
});

describe('rankCandidates', () => {
  it('orders by score, most important first', () => {
    const ranked = rankCandidates(
      [
        candidate({ sourceKey: 'a', kind: 'info', urgency: 'low' }),
        candidate({ sourceKey: 'b', kind: 'security', urgency: 'critical' }),
        candidate({ sourceKey: 'c', kind: 'system', urgency: 'high' }),
      ],
      { localHour: 12 }
    );

    expect(ranked.map((r) => r.candidate.sourceKey)).toEqual(['b', 'c', 'a']);
  });

  it('returns an empty array for no candidates', () => {
    expect(rankCandidates([], { localHour: 12 })).toEqual([]);
  });
});
