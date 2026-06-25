import { describe, expect, it } from 'vitest';
import { createActivityMeter } from './activityMeter';

describe('createActivityMeter', () => {
  it('is dark before any output arrives', () => {
    const meter = createActivityMeter();
    expect(meter.intensity(0)).toBe(0);
    expect(meter.intensity(5_000)).toBe(0);
  });

  it('rises after recording output', () => {
    const meter = createActivityMeter({ maxBytesPerTick: 1_000 });
    meter.record(500, 0);
    expect(meter.intensity(0)).toBeCloseTo(0.5, 5);
  });

  it('saturates and clamps to 1 under heavy output', () => {
    const meter = createActivityMeter({ maxBytesPerTick: 1_000 });
    meter.record(5_000, 0);
    expect(meter.intensity(0)).toBe(1);
  });

  it('halves over each half-life and fades toward zero when stalled', () => {
    const meter = createActivityMeter({
      maxBytesPerTick: 1_000,
      halfLifeMs: 400,
    });
    meter.record(1_000, 0);
    expect(meter.intensity(0)).toBe(1);

    expect(meter.intensity(400)).toBeCloseTo(0.5, 5);
    expect(meter.intensity(800)).toBeCloseTo(0.25, 5);
    expect(meter.intensity(5_000)).toBeLessThan(0.01);
  });

  it('accumulates bursts on top of the decayed energy', () => {
    const meter = createActivityMeter({
      maxBytesPerTick: 1_000,
      halfLifeMs: 400,
    });
    meter.record(600, 0);
    meter.record(300, 400); // 600 decays to 300, +300 => 600 total
    expect(meter.intensity(400)).toBeCloseTo(0.6, 5);
  });

  it('never reports a value outside [0, 1]', () => {
    const meter = createActivityMeter({ maxBytesPerTick: 1_000 });
    meter.record(-100, 0); // ignored, cannot push energy negative
    expect(meter.intensity(0)).toBe(0);
    meter.record(50_000, 0);
    expect(meter.intensity(0)).toBe(1);
    expect(meter.intensity(1_000_000)).toBeGreaterThanOrEqual(0);
  });

  it('zeroes out after reset', () => {
    const meter = createActivityMeter({ maxBytesPerTick: 1_000 });
    meter.record(1_000, 0);
    expect(meter.intensity(0)).toBe(1);

    meter.reset();
    expect(meter.intensity(0)).toBe(0);

    // Still usable after reset, and the clock re-anchors cleanly.
    meter.record(500, 1_000);
    expect(meter.intensity(1_000)).toBeCloseTo(0.5, 5);
  });
});
