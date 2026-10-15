/**
 * Proactive alert service.
 *
 * Replaces `predictiveDaemon`'s 25-second loop that emitted canned strings.
 * This is a real pipeline: poll sources -> score -> de-duplicate -> respect
 * quiet hours and focus mode -> deliver to subscribers, newest and most
 * important first.
 *
 * Sources are injected so the pipeline is unit testable without a clock or a
 * network.
 */

import {
  dedupeKey,
  scoreCandidate,
  type ProactiveCandidate,
  type QuietHours,
} from './relevance';

export interface ProactiveSource {
  /** Stable name, surfaced in diagnostics. */
  name: string;
  /** Returns candidates observed since the last poll. */
  poll(): Promise<ProactiveCandidate[]>;
}

export interface DeliveredAlert extends ProactiveCandidate {
  id: string;
  score: number;
  deliveredAt: string;
}

export interface ProactiveContext {
  quietHours?: QuietHours | null;
  focusMode?: boolean;
  /** Local hour 0-23. Defaults to the server's local hour. */
  localHour?: number;
}

export type AlertListener = (alert: DeliveredAlert) => void;

/** How many delivered alerts to retain. */
const MAX_RETAINED = 50;
/** Minimum gap before the same underlying event may be re-delivered, in minutes. */
const DEDUPE_WINDOW_MINUTES = 30;

export class ProactiveService {
  private readonly sources: ProactiveSource[] = [];
  private readonly delivered: DeliveredAlert[] = [];
  private readonly lastDeliveryByKey = new Map<string, number>();
  private readonly listeners = new Set<AlertListener>();
  private context: ProactiveContext = {};
  private timer: NodeJS.Timeout | null = null;

  registerSource(source: ProactiveSource): void {
    this.sources.push(source);
  }

  /** Number of registered sources, for /api/health. */
  get sourceCount(): number {
    return this.sources.length;
  }

  setContext(context: ProactiveContext): void {
    this.context = { ...this.context, ...context };
  }

  onAlert(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Runs one poll cycle. Returns the alerts that passed the interruption policy.
   * Safe to call concurrently; each call is independent.
   */
  async tick(now: number = Date.now()): Promise<DeliveredAlert[]> {
    const localHour = this.context.localHour ?? new Date(now).getHours();
    const emitted: DeliveredAlert[] = [];

    for (const source of this.sources) {
      let candidates: ProactiveCandidate[];
      try {
        candidates = await source.poll();
      } catch (err) {
        console.warn(`[proactive] source "${source.name}" failed:`, (err as Error)?.message);
        continue;
      }

      for (const candidate of candidates) {
        const key = dedupeKey(candidate);
        const lastAt = this.lastDeliveryByKey.get(key);
        const minutesSinceLastDelivery =
          lastAt === undefined ? undefined : (now - lastAt) / 60_000;

        const result = scoreCandidate(candidate, {
          localHour,
          quietHours: this.context.quietHours,
          focusMode: this.context.focusMode,
          minutesSinceLastDelivery,
        });

        if (!result.shouldDeliver) continue;

        const alert: DeliveredAlert = {
          ...candidate,
          id: `alert_${now}_${Math.random().toString(36).slice(2, 8)}`,
          score: result.score,
          deliveredAt: new Date(now).toISOString(),
        };

        this.lastDeliveryByKey.set(key, now);
        this.delivered.unshift(alert);
        if (this.delivered.length > MAX_RETAINED) this.delivered.length = MAX_RETAINED;
        emitted.push(alert);

        for (const listener of this.listeners) {
          try {
            listener(alert);
          } catch (err) {
            console.warn('[proactive] listener failed:', (err as Error)?.message);
          }
        }
      }
    }

    // Most important first, so a caller reading a list leads with what matters.
    return emitted.sort((a, b) => b.score - a.score);
  }

  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Do not hold the event loop open.
    this.timer.unref?.();
    console.log(`[proactive] pipeline started with ${this.sources.length} source(s).`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  list(limit = 20): DeliveredAlert[] {
    return this.delivered.slice(0, limit);
  }

  dismiss(id: string): boolean {
    const index = this.delivered.findIndex((alert) => alert.id === id);
    if (index === -1) return false;
    this.delivered.splice(index, 1);
    return true;
  }

  /** Clears de-duplication memory. Intended for tests. */
  reset(): void {
    this.delivered.length = 0;
    this.lastDeliveryByKey.clear();
  }
}

export const proactiveService = new ProactiveService();

/** Exposed so callers can reason about the same window the service uses. */
export const PROACTIVE_DEDUPE_WINDOW_MINUTES = DEDUPE_WINDOW_MINUTES;
