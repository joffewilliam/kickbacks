import {
  scoreTrustSignals,
  type TrustRiskSummary,
  type TrustSignalSnapshot,
} from '../shared/trustScoring';

interface PointerSample {
  t: number;
  x: number;
  y: number;
}

interface MonitorOptions {
  hasFocus?: () => boolean;
  isVisible?: () => boolean;
  now?: () => number;
}

export interface TrustDebugSnapshot {
  input: TrustSignalSnapshot;
  summary: TrustRiskSummary;
}

const MAX_POINTER_SAMPLES = 192;
const MAX_INTERACTION_TIMES = 192;

export class LocalTrustSignalMonitor {
  private readonly hasFocus: () => boolean;
  private readonly isVisible: () => boolean;
  private readonly now: () => number;
  private readonly startedAt: number;
  private pointerSamples: PointerSample[] = [];
  private interactionTimes: number[] = [];
  private mouseMoveCount = 0;
  private clickCount = 0;
  private keypressCount = 0;
  private syntheticEventCount = 0;
  private accumulatedFocusedMs = 0;
  private accumulatedVisibleMs = 0;
  private currentAdFocusedMs = 0;
  private currentAdVisibleMs = 0;
  private lastHumanInputAt: number;
  private lastTimingAt: number;
  private adWindowStartedAt: number | null = null;

  constructor(options: MonitorOptions = {}) {
    this.hasFocus =
      options.hasFocus ??
      (() => typeof document === 'undefined' || document.hasFocus());
    this.isVisible =
      options.isVisible ??
      (() =>
        typeof document === 'undefined' ||
        document.visibilityState === 'visible');
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.lastHumanInputAt = this.startedAt;
    this.lastTimingAt = this.startedAt;
  }

  startAdWindow(): void {
    this.updateDurations();
    this.adWindowStartedAt = this.now();
    this.currentAdFocusedMs = 0;
    this.currentAdVisibleMs = 0;
  }

  stopAdWindow(): void {
    this.updateDurations();
    this.adWindowStartedAt = null;
    this.currentAdFocusedMs = 0;
    this.currentAdVisibleMs = 0;
  }

  dispose(): void {
    // Event-backed monitors replace this with listener cleanup.
  }

  notePointerMove(event: Pick<PointerEvent, 'clientX' | 'clientY' | 'isTrusted'>): void {
    const now = this.now();
    this.noteHumanInput(now, event.isTrusted);
    this.mouseMoveCount += 1;
    this.pointerSamples.push({
      t: now,
      x: event.clientX,
      y: event.clientY,
    });
    trimToMax(this.pointerSamples, MAX_POINTER_SAMPLES);
  }

  noteClick(event: Pick<MouseEvent, 'isTrusted'>): void {
    const now = this.now();
    this.noteDiscreteInput(now, event.isTrusted);
    this.clickCount += 1;
  }

  noteKeydown(event: Pick<KeyboardEvent, 'isTrusted'>): void {
    const now = this.now();
    this.noteDiscreteInput(now, event.isTrusted);
    this.keypressCount += 1;
  }

  snapshot(adsCreditedLastHour: number): TrustDebugSnapshot {
    this.updateDurations();
    const input = this.inputSnapshot(adsCreditedLastHour);
    return {
      input,
      summary: scoreTrustSignals(input),
    };
  }

  canCreditCurrentAdWindow(minimumMs: number): boolean {
    this.updateDurations();
    return (
      this.adWindowStartedAt !== null &&
      this.currentAdVisibleMs >= minimumMs &&
      this.currentAdFocusedMs >= minimumMs
    );
  }

  consumeCreditableAdWindowInterval(minimumMs: number): boolean {
    return this.consumeCreditableAdWindowIntervalSnapshot(minimumMs, 0) !== null;
  }

  consumeCreditableAdWindowIntervalSnapshot(
    minimumMs: number,
    adsCreditedLastHour: number,
  ): TrustDebugSnapshot | null {
    if (!this.canCreditCurrentAdWindow(minimumMs)) return null;
    const snapshot = this.snapshot(adsCreditedLastHour);
    this.currentAdVisibleMs -= minimumMs;
    this.currentAdFocusedMs -= minimumMs;
    return snapshot;
  }

  private noteHumanInput(now: number, isTrusted: boolean): void {
    if (!isTrusted) this.syntheticEventCount += 1;
    this.lastHumanInputAt = now;
  }

  private noteDiscreteInput(now: number, isTrusted: boolean): void {
    this.noteHumanInput(now, isTrusted);
    this.interactionTimes.push(now);
    trimToMax(this.interactionTimes, MAX_INTERACTION_TIMES);
  }

  private inputSnapshot(adsCreditedLastHour: number): TrustSignalSnapshot {
    const now = this.now();
    const pointerStats = pointerPatternStats(this.pointerSamples);

    return {
      adFocusedMs: this.currentAdFocusedMs,
      adVisibleMs: this.currentAdVisibleMs,
      appFocusedMs: this.accumulatedFocusedMs,
      appVisibleMs: this.accumulatedVisibleMs,
      clickCount: this.clickCount,
      interactionIntervalVarianceMs: intervalStdDevMs(this.interactionTimes),
      keypressCount: this.keypressCount,
      mouseMoveCount: this.mouseMoveCount,
      periodicInputScore: periodicInputScore(this.interactionTimes),
      pointerJitterScore: pointerStats.jitterScore,
      sessionDurationMs: now - this.startedAt,
      syntheticEventCount: this.syntheticEventCount,
      timeSinceHumanInputMs: now - this.lastHumanInputAt,
      adsCreditedLastHour,
    };
  }

  private updateDurations(): void {
    const now = this.now();
    const elapsedMs = Math.max(0, now - this.lastTimingAt);
    this.lastTimingAt = now;
    if (elapsedMs === 0) return;

    const visible = this.isVisible();
    const focused = this.hasFocus();
    if (visible) this.accumulatedVisibleMs += elapsedMs;
    if (focused) this.accumulatedFocusedMs += elapsedMs;
    if (this.adWindowStartedAt !== null) {
      if (visible) this.currentAdVisibleMs += elapsedMs;
      if (focused) this.currentAdFocusedMs += elapsedMs;
    }
  }
}

export function createLocalTrustSignalMonitor(): LocalTrustSignalMonitor {
  const monitor = new LocalTrustSignalMonitor();
  const notePointerMove = (event: PointerEvent) => monitor.notePointerMove(event);
  const noteClick = (event: MouseEvent) => monitor.noteClick(event);
  const noteKeydown = (event: KeyboardEvent) => monitor.noteKeydown(event);

  window.addEventListener('pointermove', notePointerMove, { passive: true });
  window.addEventListener('click', noteClick, { passive: true });
  window.addEventListener('keydown', noteKeydown, { passive: true });

  return Object.assign(monitor, {
    dispose() {
      window.removeEventListener('pointermove', notePointerMove);
      window.removeEventListener('click', noteClick);
      window.removeEventListener('keydown', noteKeydown);
    },
  });
}

function pointerPatternStats(samples: PointerSample[]): { jitterScore: number } {
  if (samples.length < 4) return { jitterScore: 0 };
  const angleDeltas: number[] = [];
  for (let i = 2; i < samples.length; i += 1) {
    const previous = samples[i - 2];
    const current = samples[i - 1];
    const next = samples[i];
    const a = Math.atan2(current.y - previous.y, current.x - previous.x);
    const b = Math.atan2(next.y - current.y, next.x - current.x);
    const delta = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    if (Number.isFinite(delta)) angleDeltas.push(delta);
  }
  const averageDelta =
    angleDeltas.reduce((total, value) => total + value, 0) /
    Math.max(1, angleDeltas.length);
  return { jitterScore: Math.max(0, Math.min(1, averageDelta / Math.PI)) };
}

function periodicInputScore(times: number[]): number {
  if (times.length < 5) return 0;
  const intervals = intervalsBetween(times);
  const mean =
    intervals.reduce((total, interval) => total + interval, 0) /
    Math.max(1, intervals.length);
  if (mean <= 0) return 0;
  const stdDev = standardDeviation(intervals);
  return Math.max(0, Math.min(1, 1 - stdDev / mean));
}

function intervalStdDevMs(times: number[]): number {
  if (times.length < 3) return 0;
  return standardDeviation(intervalsBetween(times));
}

function intervalsBetween(times: number[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    intervals.push(Math.max(0, times[i] - times[i - 1]));
  }
  return intervals;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function trimToMax<T>(values: T[], max: number): void {
  if (values.length > max) values.splice(0, values.length - max);
}
