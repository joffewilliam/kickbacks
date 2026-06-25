import { describe, expect, it } from 'vitest';
import { onReducedMotionChange, prefersReducedMotion } from './reducedMotion';

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is undefined', () => {
    expect(prefersReducedMotion({})).toBe(false);
  });

  it('returns true when matchMedia reports matches:true', () => {
    const queries: string[] = [];
    const win = {
      matchMedia: (query: string) => {
        queries.push(query);
        return { matches: true };
      },
    };

    expect(prefersReducedMotion(win)).toBe(true);
    expect(queries).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('returns false when matchMedia reports matches:false', () => {
    expect(
      prefersReducedMotion({ matchMedia: () => ({ matches: false }) }),
    ).toBe(false);
  });

  it('defaults to the global window, absent in this env', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('onReducedMotionChange', () => {
  it('returns a no-op unsubscribe when matchMedia is unavailable', () => {
    const unsubscribe = onReducedMotionChange(() => {}, {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('reports the current preference when the query changes', () => {
    let registered: (() => void) | undefined;
    let matches = false;
    const seen: boolean[] = [];
    const win = {
      matchMedia: () => ({
        get matches() {
          return matches;
        },
        addEventListener: (_type: 'change', listener: () => void) => {
          registered = listener;
        },
        removeEventListener: () => {
          registered = undefined;
        },
      }),
    };

    const unsubscribe = onReducedMotionChange((reduced) => seen.push(reduced), win);
    matches = true;
    registered?.();

    expect(seen).toEqual([true]);

    unsubscribe();
    expect(registered).toBeUndefined();
  });

  it('falls back to the legacy addListener API', () => {
    let registered: (() => void) | undefined;
    let removed = false;
    const win = {
      matchMedia: () => ({
        matches: true,
        addListener: (listener: () => void) => {
          registered = listener;
        },
        removeListener: () => {
          removed = true;
        },
      }),
    };

    const seen: boolean[] = [];
    const unsubscribe = onReducedMotionChange((reduced) => seen.push(reduced), win);
    registered?.();
    expect(seen).toEqual([true]);

    unsubscribe();
    expect(removed).toBe(true);
  });
});
