import { describe, it, expect, vi } from 'vitest';
import { ProactiveService, type ProactiveSource } from '../src/server/proactive/service';
import type { ProactiveCandidate } from '../src/server/proactive/relevance';

function source(name: string, candidates: ProactiveCandidate[]): ProactiveSource {
  return { name, poll: vi.fn(async () => candidates) };
}

const critical: ProactiveCandidate = {
  sourceKey: 'breach',
  kind: 'security',
  urgency: 'critical',
  message: 'Perimeter breach detected.',
};

const noisy: ProactiveCandidate = {
  sourceKey: 'trivia',
  kind: 'info',
  urgency: 'low',
  message: 'All systems nominal.',
};

describe('ProactiveService', () => {
  it('delivers an alert that clears the threshold', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    const delivered = await service.tick();
    expect(delivered).toHaveLength(1);
    expect(delivered[0].message).toContain('Perimeter breach');
    expect(delivered[0].score).toBeGreaterThan(0);
    expect(service.list()).toHaveLength(1);
  });

  it('withholds a below-threshold alert', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [noisy]));

    expect(await service.tick()).toEqual([]);
    expect(service.list()).toEqual([]);
  });

  it('de-duplicates the same event across polls', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    const first = await service.tick(1_000_000);
    const second = await service.tick(1_000_000 + 60_000); // one minute later

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(service.list()).toHaveLength(1);
  });

  it('re-delivers the same event after the de-duplication window', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    await service.tick(1_000_000);
    const later = await service.tick(1_000_000 + 45 * 60_000);

    expect(later).toHaveLength(1);
  });

  it('respects quiet hours for non-critical alerts', async () => {
    const service = new ProactiveService();
    service.registerSource(
      source('test', [{ sourceKey: 'meeting', kind: 'schedule', urgency: 'high', message: 'Meeting soon.' }])
    );
    service.setContext({ quietHours: { startHour: 23, endHour: 7 } });

    // 02:00 local
    const night = new Date(2026, 0, 1, 2, 0, 0).getTime();
    expect(await service.tick(night)).toEqual([]);

    // 14:00 local
    const afternoon = new Date(2026, 0, 1, 14, 0, 0).getTime();
    expect(await service.tick(afternoon)).toHaveLength(1);
  });

  it('still delivers critical alerts during quiet hours', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));
    service.setContext({ quietHours: { startHour: 23, endHour: 7 } });

    const night = new Date(2026, 0, 1, 2, 0, 0).getTime();
    expect(await service.tick(night)).toHaveLength(1);
  });

  it('notifies subscribers', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));
    const listener = vi.fn();
    service.onAlert(listener);

    await service.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].message).toContain('Perimeter breach');
  });

  it('unsubscribes a listener', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));
    const listener = vi.fn();
    const off = service.onAlert(listener);
    off();

    await service.tick();
    expect(listener).not.toHaveBeenCalled();
  });

  it('survives a failing source without losing the others', async () => {
    const service = new ProactiveService();
    service.registerSource({
      name: 'broken',
      poll: async () => {
        throw new Error('source exploded');
      },
    });
    service.registerSource(source('working', [critical]));

    const delivered = await service.tick();
    expect(delivered).toHaveLength(1);
  });

  it('returns delivered alerts ordered by score', async () => {
    const service = new ProactiveService();
    service.registerSource(
      source('test', [
        { sourceKey: 'sys', kind: 'system', urgency: 'medium', message: 'system thing' },
        { sourceKey: 'sec', kind: 'security', urgency: 'critical', message: 'security thing' },
      ])
    );

    const delivered = await service.tick();
    expect(delivered[0].message).toBe('security thing');
  });

  it('caps retained alerts', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    for (let i = 0; i < 60; i++) {
      await service.tick(1_000_000 + i * 60 * 60_000); // one hour apart
    }

    expect(service.list(1000).length).toBeLessThanOrEqual(50);
  });

  it('dismisses an alert by id', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    const [alert] = await service.tick();
    expect(service.dismiss(alert.id)).toBe(true);
    expect(service.dismiss(alert.id)).toBe(false);
    expect(service.list()).toEqual([]);
  });

  it('reports whether the pipeline is running', () => {
    const service = new ProactiveService();
    expect(service.running).toBe(false);
    service.start(60_000);
    expect(service.running).toBe(true);
    service.stop();
    expect(service.running).toBe(false);
  });

  it('reports the registered source count', () => {
    const service = new ProactiveService();
    expect(service.sourceCount).toBe(0);
    service.registerSource(source('a', []));
    service.registerSource(source('b', []));
    expect(service.sourceCount).toBe(2);
  });

  it('reset() clears delivered alerts and de-duplication memory', async () => {
    const service = new ProactiveService();
    service.registerSource(source('test', [critical]));

    await service.tick();
    service.reset();

    expect(service.list()).toEqual([]);
    expect(await service.tick()).toHaveLength(1);
  });
});
