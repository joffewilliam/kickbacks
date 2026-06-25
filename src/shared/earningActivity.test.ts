import { describe, expect, it } from 'vitest';
import {
  createEarningActivityTracker,
  earningDebugStatusForTracker,
  payableActivityForSponsor,
} from './earningActivity';

describe('earning activity verification', () => {
  it('rejects an idle terminal before a thinking line is observed', () => {
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => 10_000,
    });

    const result = payableActivityForSponsor({
      now: 10_000,
      tracker,
    });

    expect(result).toEqual({
      payable: false,
      reason: 'model-not-detected',
      label: 'Waiting for model activity',
    });
  });

  it('accepts only a recent provider-specific thinking line', () => {
    let now = 20_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
    });

    tracker.noteInput('codex\r');
    now += 400;
    tracker.noteOutput('\u2022 Working (2s \u2022 esc to interrupt)');

    expect(
      payableActivityForSponsor({
        now,
        tracker,
      }),
    ).toEqual({
      payable: true,
      reason: 'active',
      label: 'Codex thinking verified',
      provider: 'codex',
    });
    expect(tracker.snapshot()).toMatchObject({
      detectedProvider: 'codex',
      terminalId: 'terminal-1',
    });
    expect(JSON.stringify(tracker.snapshot())).not.toContain('Working');
  });

  it('rejects generic output even after a provider command', () => {
    let now = 25_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
    });
    tracker.noteInput('claude\r');
    now += 400;
    tracker.noteOutput('thinking about a README is just normal output');

    const result = payableActivityForSponsor({
      now,
      tracker,
    });

    expect(result).toEqual({
      payable: false,
      reason: 'thinking-line-not-detected',
      label: 'Waiting for thinking line',
    });
  });

  it('rejects stale thinking lines so idle agents stop earning', () => {
    let now = 30_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
    });
    tracker.noteInput('claude\r');
    tracker.noteOutput('\u273b Thinking\u2026');

    const result = payableActivityForSponsor({
      now: now + 20_000,
      tracker,
    });

    expect(result).toEqual({
      payable: false,
      reason: 'idle-terminal',
      label: 'Model is no longer thinking',
    });
  });

  it('exposes privacy-safe detector debug without terminal text', () => {
    let now = 50_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
    });
    tracker.noteInput('codex\r');
    now += 250;
    tracker.noteOutput('\u2022 Working (1s \u2022 esc to interrupt)');

    const status = earningDebugStatusForTracker({
      now: now + 500,
      tracker,
    });

    expect(status).toMatchObject({
      detectedProvider: 'codex',
      inputBytes: 6,
      lastInputAgeMs: 750,
      lastOutputAgeMs: 500,
      lastThinkingAgeMs: 500,
      payable: true,
      reason: 'active',
      terminalId: 'terminal-1',
    });
    expect(JSON.stringify(status)).not.toContain('Working');
  });

  it('detects Codex thinking from real bullet characters and split terminal chunks', () => {
    let now = 60_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
    });
    tracker.noteInput('codex\r');
    now += 100;
    tracker.noteOutput('\u001b[2K\r\u2022 Work');
    now += 100;
    tracker.noteOutput('ing (11s \u2022 esc to interrupt)');

    expect(
      payableActivityForSponsor({
        now: now + 10_000,
        tracker,
      }),
    ).toEqual({
      payable: true,
      reason: 'active',
      label: 'Codex thinking verified',
      provider: 'codex',
    });
  });

  it('accepts structured Codex app-server activity without terminal output text', () => {
    let now = 70_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
      terminalTextDetection: false,
    });

    tracker.noteStructuredActivity({
      active: true,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    expect(
      payableActivityForSponsor({
        now: now + 45_000,
        tracker,
      }),
    ).toEqual({
      payable: true,
      reason: 'active',
      label: 'Codex thinking verified',
      provider: 'codex',
    });
    expect(tracker.snapshot()).toMatchObject({
      detectedProvider: 'codex',
      inputBytes: 0,
      outputBytes: 0,
      structuredActivityActive: true,
      verificationSource: 'codex-app-server',
    });
  });

  it('stops paying immediately when structured Codex activity becomes idle', () => {
    let now = 80_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
      terminalTextDetection: false,
    });
    tracker.noteStructuredActivity({
      active: true,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
    now += 1_000;
    tracker.noteStructuredActivity({
      active: false,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    expect(
      payableActivityForSponsor({
        now,
        tracker,
      }),
    ).toEqual({
      payable: false,
      reason: 'idle-terminal',
      label: 'Model is no longer thinking',
    });
  });

  it('tracks current and last completed structured thinking durations', () => {
    let now = 90_000;
    const tracker = createEarningActivityTracker({
      terminalId: 'terminal-1',
      now: () => now,
      terminalTextDetection: false,
    });

    tracker.noteStructuredActivity({
      active: true,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    now += 2_500;
    expect(
      earningDebugStatusForTracker({
        now,
        tracker,
      }),
    ).toMatchObject({
      currentThinkingDurationMs: 2_500,
      lastThinkingDurationMs: null,
    });

    tracker.noteStructuredActivity({
      active: false,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    expect(
      earningDebugStatusForTracker({
        now,
        tracker,
      }),
    ).toMatchObject({
      currentThinkingDurationMs: null,
      lastThinkingDurationMs: 2_500,
    });
  });
});
