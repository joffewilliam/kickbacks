import { describe, expect, it } from 'vitest';
import { scoreTrustSignals } from './trustScoring';

describe('trust scoring', () => {
  it('keeps visible focused sessions with recent human input low risk', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 5_000,
      appFocusedMs: 5_000,
      appVisibleMs: 5_000,
      clickCount: 1,
      interactionIntervalVarianceMs: 420,
      keypressCount: 4,
      mouseMoveCount: 34,
      periodicInputScore: 0.08,
      pointerJitterScore: 0.42,
      sessionDurationMs: 22 * 60_000,
      syntheticEventCount: 0,
      timeSinceHumanInputMs: 8_000,
      adsCreditedLastHour: 17,
    });

    expect(summary.level).toBe('low');
    expect(summary.score).toBeLessThan(0.35);
    expect(summary.reasons).toContain('visible-ad');
    expect(summary.reasons).toContain('recent-human-input');
    expect(summary.counters.mouseMoves).toBe('10-50');
  });

  it('flags earning sessions with long idle time as high risk', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 5_000,
      appFocusedMs: 5_000,
      appVisibleMs: 5_000,
      clickCount: 0,
      interactionIntervalVarianceMs: 0,
      keypressCount: 0,
      mouseMoveCount: 0,
      periodicInputScore: 0,
      pointerJitterScore: 0,
      sessionDurationMs: 9 * 60 * 60_000,
      syntheticEventCount: 0,
      timeSinceHumanInputMs: 45 * 60_000,
      adsCreditedLastHour: 96,
    });

    expect(summary.level).toBe('high');
    expect(summary.score).toBeGreaterThanOrEqual(0.7);
    expect(summary.reasons).toContain('long-idle-while-earning');
    expect(summary.reasons).toContain('continuous-session');
  });

  it('flags synthetic or recorder-like input patterns without exposing raw events', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 5_000,
      appFocusedMs: 5_000,
      appVisibleMs: 5_000,
      clickCount: 8,
      interactionIntervalVarianceMs: 12,
      keypressCount: 0,
      mouseMoveCount: 160,
      periodicInputScore: 0.93,
      pointerJitterScore: 0.02,
      sessionDurationMs: 2 * 60 * 60_000,
      syntheticEventCount: 2,
      timeSinceHumanInputMs: 4_000,
      adsCreditedLastHour: 72,
    });

    expect(summary.level).toBe('high');
    expect(summary.reasons).toContain('synthetic-input');
    expect(summary.reasons).toContain('periodic-input-pattern');
    expect(summary.reasons).toContain('low-pointer-jitter');
    expect(JSON.stringify(summary)).not.toContain('"x"');
    expect(JSON.stringify(summary)).not.toContain('"y"');
  });

  it('does not call a visible ad window inactive when focus is the missing signal', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 0,
      appFocusedMs: 0,
      appVisibleMs: 5_000,
      clickCount: 1,
      interactionIntervalVarianceMs: 300,
      keypressCount: 0,
      mouseMoveCount: 14,
      periodicInputScore: 0.2,
      pointerJitterScore: 0.38,
      sessionDurationMs: 12 * 60_000,
      syntheticEventCount: 0,
      timeSinceHumanInputMs: 20_000,
      adsCreditedLastHour: 4,
    });

    expect(summary.reasons).toContain('visible-ad');
    expect(summary.reasons).toContain('app-not-focused');
    expect(summary.reasons).not.toContain('ad-window-not-active');
  });

  it('does not flag straight pointer movement unless timing also looks automated', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 5_000,
      appFocusedMs: 5_000,
      appVisibleMs: 5_000,
      clickCount: 2,
      interactionIntervalVarianceMs: 260,
      keypressCount: 18,
      mouseMoveCount: 120,
      periodicInputScore: 0.18,
      pointerJitterScore: 0.03,
      sessionDurationMs: 18 * 60_000,
      syntheticEventCount: 0,
      timeSinceHumanInputMs: 2_000,
      adsCreditedLastHour: 12,
    });

    expect(summary.reasons).not.toContain('low-pointer-jitter');
    expect(summary.level).toBe('low');
  });

  it('requires focus during the active ad window, not just earlier app focus', () => {
    const summary = scoreTrustSignals({
      adVisibleMs: 5_000,
      adFocusedMs: 0,
      appFocusedMs: 60_000,
      appVisibleMs: 60_000,
      clickCount: 1,
      interactionIntervalVarianceMs: 300,
      keypressCount: 3,
      mouseMoveCount: 28,
      periodicInputScore: 0.18,
      pointerJitterScore: 0.31,
      sessionDurationMs: 15 * 60_000,
      syntheticEventCount: 0,
      timeSinceHumanInputMs: 3_000,
      adsCreditedLastHour: 9,
    });

    expect(summary.reasons).toContain('visible-ad');
    expect(summary.reasons).toContain('app-not-focused');
    expect(summary.reasons).not.toContain('focused-window');
  });
});
