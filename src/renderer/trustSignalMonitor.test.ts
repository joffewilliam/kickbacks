import { describe, expect, it } from 'vitest';
import { LocalTrustSignalMonitor } from './trustSignalMonitor';

describe('LocalTrustSignalMonitor', () => {
  it('tracks app focus independently from active ad windows', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    now += 12_000;
    const debug = monitor.snapshot(0);

    expect(debug.input.adVisibleMs).toBe(0);
    expect(debug.input.adFocusedMs).toBe(0);
    expect(debug.input.appFocusedMs).toBe(12_000);
    expect(debug.input.appVisibleMs).toBe(12_000);
    expect(debug.summary.counters.appFocusedSeconds).toBe('10-30s');
  });

  it('tracks completed visible ad window time separately', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    now += 8_000;
    monitor.startAdWindow();
    now += 5_000;
    const debug = monitor.snapshot(0);

    expect(debug.input.adVisibleMs).toBe(5_000);
    expect(debug.input.adFocusedMs).toBe(5_000);
    expect(debug.input.appFocusedMs).toBe(13_000);
    expect(debug.summary.reasons).toContain('visible-ad');
  });

  it('tracks app focus and visibility cumulatively instead of counting hidden time', () => {
    let now = 1_000;
    let focused = true;
    let visible = true;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => focused,
      isVisible: () => visible,
      now: () => now,
    });

    now += 5_000;
    monitor.snapshot(0);
    focused = false;
    visible = false;
    now += 5_000;
    monitor.snapshot(0);
    focused = true;
    visible = true;
    now += 2_000;
    const debug = monitor.snapshot(0);

    expect(debug.input.appFocusedMs).toBe(7_000);
    expect(debug.input.appVisibleMs).toBe(7_000);
  });

  it('requires a full visible and focused ad window before crediting an interval', () => {
    let now = 1_000;
    let focused = true;
    let visible = true;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => focused,
      isVisible: () => visible,
      now: () => now,
    });

    monitor.startAdWindow();
    now += 3_000;
    monitor.snapshot(0);
    visible = false;
    focused = false;
    now += 4_000;
    monitor.snapshot(0);

    expect(monitor.canCreditCurrentAdWindow(5_000)).toBe(false);

    visible = true;
    focused = true;
    now += 2_000;
    monitor.snapshot(0);

    expect(monitor.canCreditCurrentAdWindow(5_000)).toBe(true);
  });

  it('consumes one verified ad interval per credit', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    monitor.startAdWindow();
    now += 5_000;

    expect(monitor.consumeCreditableAdWindowInterval(5_000)).toBe(true);
    expect(monitor.consumeCreditableAdWindowInterval(5_000)).toBe(false);

    now += 5_000;

    expect(monitor.consumeCreditableAdWindowInterval(5_000)).toBe(true);
  });

  it('restarts focused visible timing when a new ad window starts', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    monitor.startAdWindow();
    now += 4_000;
    monitor.snapshot(0);
    monitor.startAdWindow();
    now += 1_000;

    expect(monitor.canCreditCurrentAdWindow(5_000)).toBe(false);

    now += 4_000;

    expect(monitor.canCreditCurrentAdWindow(5_000)).toBe(true);
  });

  it('returns the pre-consume trust snapshot for a credited ad interval', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    monitor.startAdWindow();
    now += 5_000;

    const credited = monitor.consumeCreditableAdWindowIntervalSnapshot(
      5_000,
      3,
    );

    expect(credited?.summary.reasons).toContain('visible-ad');
    expect(credited?.summary.counters.adVisibleSeconds).toBe('5-10s');
    expect(credited?.summary.counters.adsLastHour).toBe('1-5');
    expect(monitor.snapshot(3).summary.reasons).toContain(
      'ad-window-not-active',
    );
  });

  it('does not treat display-cadenced pointer movement as periodic bot input', () => {
    let now = 1_000;
    const monitor = new LocalTrustSignalMonitor({
      hasFocus: () => true,
      isVisible: () => true,
      now: () => now,
    });

    monitor.startAdWindow();

    for (let i = 0; i < 80; i += 1) {
      now += 16;
      monitor.notePointerMove({
        clientX: 100 + i * 4,
        clientY: 240,
        isTrusted: true,
      });
    }

    now += 5_000;
    const debug = monitor.snapshot(0);

    expect(debug.input.periodicInputScore).toBe(0);
    expect(debug.input.timeSinceHumanInputMs).toBe(5_000);
    expect(debug.summary.reasons).toContain('recent-human-input');
    expect(debug.summary.reasons).not.toContain('periodic-input-pattern');
    expect(debug.summary.reasons).not.toContain('low-pointer-jitter');
  });
});
