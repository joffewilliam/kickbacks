/**
 * A decaying output meter: feed it byte counts as output streams in and read a
 * [0, 1] glow `intensity` that brightens while output flows and fades
 * exponentially toward zero when the stream stalls.
 *
 * Ported from upstream's `createActivityMeter` (commit 6f03bd8,
 * src/renderer/features/workspace/activityMeter.ts). The decay model is
 * identical -- raw byte "energy" accumulates and is multiplied by
 * `0.5^(elapsed / halfLifeMs)` between samples, then divided by the
 * full-glow byte budget and clamped to [0, 1]. The surface differs to match
 * kickbacks' contract: the clock is injected per-call as an explicit `now`
 * (rather than a `now()` closure) so the meter is fully deterministic and
 * testable without timers, and a `reset()` is provided so a recycled card can
 * go dark instantly.
 */

export interface ActivityMeter {
  /** Add output (e.g. a pty data chunk's byte length) observed at `now`. */
  record(bytes: number, now: number): void;
  /** Current decayed glow level in [0, 1] as of `now`. */
  intensity(now: number): number;
  /** Drop all accumulated energy so the meter reads 0 again. */
  reset(): void;
}

export interface ActivityMeterOptions {
  /** Time for accumulated energy to halve when no output arrives. */
  halfLifeMs?: number;
  /** Byte budget that maps to full glow (intensity 1) before decay. */
  maxBytesPerTick?: number;
}

/** Time for the glow to halve when output stalls. */
export const HEARTBEAT_HALF_LIFE_MS = 1200;
/** Byte budget that maps to full glow. */
export const HEARTBEAT_MAX_BYTES_PER_TICK = 1500;

export function createActivityMeter({
  halfLifeMs = HEARTBEAT_HALF_LIFE_MS,
  maxBytesPerTick = HEARTBEAT_MAX_BYTES_PER_TICK,
}: ActivityMeterOptions = {}): ActivityMeter {
  // Guard against non-positive config that would make decay NaN/instant.
  const safeHalfLife = halfLifeMs > 0 ? halfLifeMs : HEARTBEAT_HALF_LIFE_MS;
  const safeBudget =
    maxBytesPerTick > 0 ? maxBytesPerTick : HEARTBEAT_MAX_BYTES_PER_TICK;

  let energy = 0;
  // Lazily anchored on the first interaction so a meter constructed long
  // before its first sample does not pre-decay against an arbitrary clock.
  let lastAt: number | null = null;

  function decayTo(now: number): void {
    if (lastAt === null) {
      lastAt = now;
      return;
    }
    const elapsed = now - lastAt;
    if (elapsed > 0) {
      energy *= Math.pow(0.5, elapsed / safeHalfLife);
    }
    lastAt = now;
  }

  return {
    record(bytes, now) {
      decayTo(now);
      if (bytes > 0) energy += bytes;
    },
    intensity(now) {
      decayTo(now);
      return Math.min(1, Math.max(0, energy / safeBudget));
    },
    reset() {
      energy = 0;
      lastAt = null;
    },
  };
}
