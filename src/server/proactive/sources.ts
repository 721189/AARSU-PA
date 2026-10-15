/**
 * Proactive alert sources.
 *
 * Only sources backed by real signals are enabled by default. Calendar and email
 * sources require server-side OAuth refresh tokens (Phase 6) and are therefore
 * declared but not registered until credentials exist — rather than being faked.
 */

import os from 'node:os';
import type { ProactiveSource } from './service';
import type { ProactiveCandidate } from './relevance';

/** Thresholds at which real host telemetry becomes worth mentioning. */
export interface SystemThresholds {
  /** Heap used, in MB, above which the assistant offers to prune caches. */
  heapWarnMb: number;
  /** 1-minute load average per CPU above which the host is considered busy. */
  loadPerCpuWarn: number;
  /** Free-memory percentage below which the assistant warns. */
  freeMemoryPercentWarn: number;
}

export const DEFAULT_SYSTEM_THRESHOLDS: SystemThresholds = {
  heapWarnMb: 900,
  loadPerCpuWarn: 0.9,
  freeMemoryPercentWarn: 10,
};

/**
 * Real host telemetry. Reads `os` and `process` directly — no random numbers.
 * Emits at most one candidate per condition per poll.
 */
export class SystemTelemetrySource implements ProactiveSource {
  readonly name = 'system-telemetry';
  private readonly thresholds: SystemThresholds;

  constructor(thresholds: Partial<SystemThresholds> = {}) {
    this.thresholds = { ...DEFAULT_SYSTEM_THRESHOLDS, ...thresholds };
  }

  async poll(): Promise<ProactiveCandidate[]> {
    const candidates: ProactiveCandidate[] = [];
    const memory = process.memoryUsage();
    const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMb = Math.round(os.freemem() / 1024 / 1024);
    const freePercent = totalMb > 0 ? (freeMb / totalMb) * 100 : 100;
    const loadPerCpu = os.loadavg()[0] / Math.max(1, os.cpus().length);

    if (heapUsedMb >= this.thresholds.heapWarnMb) {
      candidates.push({
        // Keyed by the condition, so a sustained high heap does not re-alert
        // every poll within the de-duplication window.
        sourceKey: 'heap-high',
        kind: 'system',
        urgency: 'medium',
        message: `Process heap is at ${heapUsedMb} MB.`,
        recommendation: 'Offer to prune caches and trigger a garbage-collection pass.',
      });
    }

    if (loadPerCpu >= this.thresholds.loadPerCpuWarn) {
      candidates.push({
        sourceKey: 'load-high',
        kind: 'system',
        urgency: 'medium',
        message: `Host load average is ${loadPerCpu.toFixed(2)} per core.`,
        recommendation: 'Defer non-urgent background work until the host settles.',
      });
    }

    if (freePercent <= this.thresholds.freeMemoryPercentWarn) {
      candidates.push({
        sourceKey: 'memory-low',
        kind: 'system',
        urgency: 'high',
        message: `Only ${freePercent.toFixed(1)}% of host memory is free (${freeMb} MB of ${totalMb} MB).`,
        recommendation: 'Warn the user before starting anything memory-heavy.',
      });
    }

    return candidates;
  }
}

/**
 * A source whose underlying signal is a Google Calendar or Gmail feed.
 *
 * NOT registered until server-side OAuth is in place (Phase 6). It is declared
 * here so the shape is fixed and the pipeline can be wired up without faking
 * events in the meantime.
 */
export interface WorkspaceEventSource extends ProactiveSource {
  /** True when the source has usable credentials. */
  readonly available: boolean;
}
