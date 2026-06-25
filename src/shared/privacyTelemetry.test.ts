import { describe, expect, it } from 'vitest';
import {
  FIVE_SECOND_AD_CREDIT_USD,
  buildAdClickEvent,
  buildAdImpressionEvent,
  isPrivacySafeAdEvent,
} from './privacyTelemetry';

describe('privacy-safe ad telemetry', () => {
  it('builds impression events without terminal output, commands, paths, or prompts', () => {
    const event = buildAdImpressionEvent({
      userId: 'user-1',
      sessionId: 'session-1',
      terminalId: 'terminal-1',
      provider: 'claude',
      placement: 'thinking-line',
      advertiser: 'Neon',
      creativeId: 'creative-neon-001',
      renderedMs: 5000,
      at: '2026-06-17T17:05:00.000Z',
      terminalOutput: 'secret source code',
      command: 'claude --dangerously-include-private-thing',
      cwd: 'D:\\secret-client',
      promptText: 'private customer prompt',
    });

    expect(event).toEqual(expect.objectContaining({
      kind: 'ad.impression',
      client: 'Kickbacks.ai',
      userId: 'user-1',
      sessionId: 'session-1',
      terminalId: 'terminal-1',
      provider: 'claude',
      placement: 'thinking-line',
      advertiser: 'Neon',
      creativeId: 'creative-neon-001',
      creditUsd: FIVE_SECOND_AD_CREDIT_USD,
      renderedMs: 5000,
      at: '2026-06-17T17:05:00.000Z',
    }));
    expect(event.eventId).toMatch(/^.+$/);
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(isPrivacySafeAdEvent(event)).toBe(true);
  });

  it('rejects ad events containing raw terminal or workspace fields', () => {
    expect(
      isPrivacySafeAdEvent({
        kind: 'ad.impression',
        terminalOutput: 'raw bytes',
      }),
    ).toBe(false);
    expect(
      isPrivacySafeAdEvent({
        kind: 'ad.click',
        cwd: 'D:\\private',
      }),
    ).toBe(false);
    expect(
      isPrivacySafeAdEvent({
        kind: 'ad.click',
        command: 'codex exec private prompt',
      }),
    ).toBe(false);
  });

  it('builds click events with destination and no terminal payload', () => {
    const event = buildAdClickEvent({
      userId: 'user-1',
      sessionId: 'session-1',
      terminalId: 'terminal-1',
      provider: 'codex',
      placement: 'rewarded-video',
      advertiser: 'Railway',
      creativeId: 'creative-railway-001',
      destinationUrl: 'https://kickbacks.ai/sponsor/railway',
      at: '2026-06-17T17:06:00.000Z',
      terminalOutput: 'do not keep this',
    });

    expect(event.destinationUrl).toBe('https://kickbacks.ai/sponsor/railway');
    expect(event.advertiser).toBe('Railway');
    expect(event.creditUsd).toBe(0.25);
    expect(event.terminalId).toBe('terminal-1');
    expect(JSON.stringify(event)).not.toContain('do not keep this');
    expect(isPrivacySafeAdEvent(event)).toBe(true);
  });

  it('keeps trust scoring metadata bucketed and privacy safe', () => {
    const event = buildAdImpressionEvent({
      userId: 'user-1',
      sessionId: 'session-1',
      terminalId: 'terminal-1',
      provider: 'codex',
      placement: 'thinking-line',
      advertiser: 'Neon',
      creativeId: 'creative-neon-001',
      renderedMs: 5000,
      trust: {
        score: 0.74,
        level: 'high',
        reasons: ['periodic-input-pattern', 'long-idle-while-earning'],
        counters: {
          adVisibleSeconds: '5-10s',
          appFocusedSeconds: '5-10s',
          appVisibleSeconds: '5-10s',
          adsLastHour: '50-100',
          clicks: '1-5',
          interactionVariance: 'very-low',
          keypresses: '0',
          mouseMoves: '100+',
          pointerJitter: 'very-low',
          sessionDuration: '8h+',
          syntheticEvents: '0',
          timeSinceHumanInput: '30-60m',
        },
      },
    });

    expect(event.trust?.level).toBe('high');
    expect(JSON.stringify(event)).not.toContain('clientX');
    expect(JSON.stringify(event)).not.toContain('clientY');
    expect(JSON.stringify(event)).not.toContain('keydown');
    expect(isPrivacySafeAdEvent(event)).toBe(true);
  });
});
