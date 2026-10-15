/**
 * Proactive-alert relevance rules.
 *
 * The previous "proactive daemon" was a 25-second `setInterval` that emitted a
 * canned string ("All suit and computational matrices are green, Sir") and a
 * random 60% of the time said nothing at all. There was no scoring, no
 * de-duplication, no quiet hours and no notion of whether an alert was worth
 * interrupting for.
 *
 * Everything here is pure so the interruption policy can be unit tested.
 */

export type AlertKind = 'system' | 'schedule' | 'email' | 'security' | 'biometric' | 'info';
export type AlertUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface ProactiveCandidate {
  /** Stable identity of the underlying *thing* (event id, device id, metric). */
  sourceKey: string;
  kind: AlertKind;
  urgency: AlertUrgency;
  /** What the user is told. */
  message: string;
  /** What the assistant suggests doing about it. */
  recommendation?: string;
  /** ISO timestamp of when the underlying event occurred. */
  at?: string;
}

export interface QuietHours {
  startHour: number;
  endHour: number;
}

const URGENCY_WEIGHT: Record<AlertUrgency, number> = {
  low: 0.15,
  medium: 0.4,
  high: 0.75,
  critical: 1,
};

const KIND_WEIGHT: Record<AlertKind, number> = {
  security: 1,
  system: 0.8,
  schedule: 0.7,
  email: 0.5,
  biometric: 0.6,
  info: 0.3,
};

/** Minimum score required to interrupt the user at all. */
export const INTERRUPTION_THRESHOLD = 0.45;

/**
 * True when `hour` falls inside a quiet-hours window, correctly handling a
 * window that wraps past midnight (e.g. 23 -> 7).
 */
export function isWithinQuietHours(hour: number, quietHours?: QuietHours | null): boolean {
  if (!quietHours) return false;
  const { startHour, endHour } = quietHours;

  // A zero-length window means "no quiet hours" rather than "always quiet".
  if (startHour === endHour) return false;

  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Wraps midnight.
  return hour >= startHour || hour < endHour;
}

export interface ScoreContext {
  /** Local hour of the user, 0-23. */
  localHour: number;
  quietHours?: QuietHours | null;
  /** When false, only critical alerts may interrupt. */
  focusMode?: boolean;
  /** How recently this sourceKey was already delivered, in minutes. */
  minutesSinceLastDelivery?: number;
}

export interface ScoreResult {
  score: number;
  /** True when the alert should be surfaced now. */
  shouldDeliver: boolean;
  /** Set when the alert is deliberately withheld, explaining why. */
  withheldReason?: 'quiet_hours' | 'focus_mode' | 'below_threshold' | 'duplicate';
}

/**
 * Scores a candidate alert and decides whether it may interrupt.
 *
 * Order matters: a duplicate is never re-delivered, quiet hours only silence
 * non-critical alerts, and focus mode is stricter still.
 */
export function scoreCandidate(candidate: ProactiveCandidate, context: ScoreContext): ScoreResult {
  const base = URGENCY_WEIGHT[candidate.urgency] * KIND_WEIGHT[candidate.kind];
  const score = Number(base.toFixed(4));

  // Never repeat the same underlying event.
  if (
    context.minutesSinceLastDelivery !== undefined &&
    context.minutesSinceLastDelivery < 30
  ) {
    return { score, shouldDeliver: false, withheldReason: 'duplicate' };
  }

  const isCritical = candidate.urgency === 'critical';

  if (!isCritical && isWithinQuietHours(context.localHour, context.quietHours)) {
    return { score, shouldDeliver: false, withheldReason: 'quiet_hours' };
  }

  if (context.focusMode && !isCritical) {
    return { score, shouldDeliver: false, withheldReason: 'focus_mode' };
  }

  if (score < INTERRUPTION_THRESHOLD) {
    return { score, shouldDeliver: false, withheldReason: 'below_threshold' };
  }

  return { score, shouldDeliver: true };
}

/** Stable de-duplication key for a candidate. */
export function dedupeKey(candidate: Pick<ProactiveCandidate, 'kind' | 'sourceKey'>): string {
  return `${candidate.kind}:${candidate.sourceKey}`;
}

/**
 * Ranks candidates by score, highest first. Used to decide what to mention when
 * several things happen at once — a JARVIS-style assistant leads with the most
 * important item rather than reading a list.
 */
export function rankCandidates(
  candidates: readonly ProactiveCandidate[],
  context: Omit<ScoreContext, 'minutesSinceLastDelivery'>
): Array<{ candidate: ProactiveCandidate; score: number }> {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, context).score }))
    .sort((a, b) => b.score - a.score);
}
