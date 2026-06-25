export type TrustRiskLevel = 'low' | 'medium' | 'high';

export type TrustRiskReason =
  | 'visible-ad'
  | 'focused-window'
  | 'app-not-focused'
  | 'recent-human-input'
  | 'ad-window-not-active'
  | 'long-idle-while-earning'
  | 'continuous-session'
  | 'high-ad-volume'
  | 'synthetic-input'
  | 'periodic-input-pattern'
  | 'low-pointer-jitter'
  | 'low-human-input';

export interface TrustSignalSnapshot {
  adFocusedMs: number;
  adVisibleMs: number;
  appFocusedMs: number;
  appVisibleMs: number;
  clickCount: number;
  interactionIntervalVarianceMs: number;
  keypressCount: number;
  mouseMoveCount: number;
  periodicInputScore: number;
  pointerJitterScore: number;
  sessionDurationMs: number;
  syntheticEventCount: number;
  timeSinceHumanInputMs: number;
  adsCreditedLastHour: number;
}

export interface TrustRiskCounters {
  adVisibleSeconds: string;
  appFocusedSeconds: string;
  appVisibleSeconds: string;
  adsLastHour: string;
  clicks: string;
  interactionVariance: string;
  keypresses: string;
  mouseMoves: string;
  pointerJitter: string;
  sessionDuration: string;
  syntheticEvents: string;
  timeSinceHumanInput: string;
}

export interface TrustRiskSummary {
  score: number;
  level: TrustRiskLevel;
  reasons: TrustRiskReason[];
  counters: TrustRiskCounters;
}

const AD_VISIBLE_MIN_MS = 5_000;
const RECENT_HUMAN_INPUT_MS = 2 * 60_000;
const LONG_IDLE_MS = 30 * 60_000;
const CONTINUOUS_SESSION_MS = 8 * 60 * 60_000;

export function scoreTrustSignals(
  snapshot: TrustSignalSnapshot,
): TrustRiskSummary {
  const reasons = new Set<TrustRiskReason>();
  let risk = 0.2;

  if (
    snapshot.adVisibleMs >= AD_VISIBLE_MIN_MS &&
    snapshot.appVisibleMs >= AD_VISIBLE_MIN_MS
  ) {
    reasons.add('visible-ad');
    risk -= 0.08;
  } else {
    reasons.add('ad-window-not-active');
    risk += 0.24;
  }

  if (snapshot.adFocusedMs >= AD_VISIBLE_MIN_MS) {
    reasons.add('focused-window');
    risk -= 0.04;
  } else {
    reasons.add('app-not-focused');
    risk += 0.12;
  }

  const humanInputCount =
    snapshot.mouseMoveCount + snapshot.clickCount + snapshot.keypressCount;
  if (
    humanInputCount > 0 &&
    snapshot.timeSinceHumanInputMs <= RECENT_HUMAN_INPUT_MS
  ) {
    reasons.add('recent-human-input');
    risk -= 0.08;
  } else {
    reasons.add('low-human-input');
    risk += 0.2;
  }

  if (snapshot.timeSinceHumanInputMs >= LONG_IDLE_MS) {
    reasons.add('long-idle-while-earning');
    risk += 0.3;
  }

  if (snapshot.sessionDurationMs >= CONTINUOUS_SESSION_MS) {
    reasons.add('continuous-session');
    risk += 0.18;
  }

  if (snapshot.adsCreditedLastHour >= 90) {
    reasons.add('high-ad-volume');
    risk += 0.16;
  }

  if (snapshot.syntheticEventCount > 0) {
    reasons.add('synthetic-input');
    risk += 0.28;
  }

  if (
    snapshot.periodicInputScore >= 0.85 ||
    (snapshot.periodicInputScore > 0 &&
      humanInputCount >= 8 &&
      snapshot.interactionIntervalVarianceMs < 35)
  ) {
    reasons.add('periodic-input-pattern');
    risk += 0.24;
  }

  if (
    snapshot.mouseMoveCount >= 40 &&
    snapshot.pointerJitterScore < 0.08 &&
    snapshot.periodicInputScore >= 0.85
  ) {
    reasons.add('low-pointer-jitter');
    risk += 0.2;
  }

  const score = clamp01(risk);
  return {
    score,
    level: riskLevel(score),
    reasons: [...reasons],
    counters: {
      adVisibleSeconds: durationBucket(snapshot.adVisibleMs),
      appFocusedSeconds: durationBucket(snapshot.appFocusedMs),
      appVisibleSeconds: durationBucket(snapshot.appVisibleMs),
      adsLastHour: countBucket(snapshot.adsCreditedLastHour),
      clicks: countBucket(snapshot.clickCount),
      interactionVariance: varianceBucket(snapshot.interactionIntervalVarianceMs),
      keypresses: countBucket(snapshot.keypressCount),
      mouseMoves: countBucket(snapshot.mouseMoveCount),
      pointerJitter: scoreBucket(snapshot.pointerJitterScore),
      sessionDuration: durationBucket(snapshot.sessionDurationMs),
      syntheticEvents: countBucket(snapshot.syntheticEventCount),
      timeSinceHumanInput: durationBucket(snapshot.timeSinceHumanInputMs),
    },
  };
}

function riskLevel(score: number): TrustRiskLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function countBucket(value: number): string {
  if (value <= 0) return '0';
  if (value <= 5) return '1-5';
  if (value <= 10) return '6-10';
  if (value <= 50) return '10-50';
  if (value <= 100) return '50-100';
  return '100+';
}

function durationBucket(valueMs: number): string {
  const seconds = valueMs / 1_000;
  if (seconds < 5) return '<5s';
  if (seconds < 10) return '5-10s';
  if (seconds < 30) return '10-30s';
  if (seconds < 60) return '30-60s';
  const minutes = seconds / 60;
  if (minutes < 5) return '1-5m';
  if (minutes < 30) return '5-30m';
  if (minutes < 60) return '30-60m';
  const hours = minutes / 60;
  if (hours < 4) return '1-4h';
  if (hours < 8) return '4-8h';
  return '8h+';
}

function varianceBucket(valueMs: number): string {
  if (valueMs < 35) return 'very-low';
  if (valueMs < 150) return 'low';
  if (valueMs < 800) return 'normal';
  return 'high';
}

function scoreBucket(value: number): string {
  if (value < 0.1) return 'very-low';
  if (value < 0.35) return 'low';
  if (value < 0.7) return 'normal';
  return 'high';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
