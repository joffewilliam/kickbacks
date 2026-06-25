const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface MediaQueryLike {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

interface MatchMediaWindow {
  matchMedia?: (query: string) => MediaQueryLike;
}

function resolveWindow(
  win: MatchMediaWindow | undefined,
): MatchMediaWindow | undefined {
  if (win !== undefined) return win;
  return globalThis as MatchMediaWindow;
}

/**
 * Whether the OS asks for reduced motion. Guarded for the node test
 * environment and runtimes without matchMedia — both report false so
 * animations stay enabled rather than crashing.
 */
export function prefersReducedMotion(
  win?: { matchMedia?: (q: string) => { matches: boolean } },
): boolean {
  const target = resolveWindow(win);
  if (!target || typeof target.matchMedia !== 'function') return false;
  return target.matchMedia(REDUCE_MOTION_QUERY).matches;
}

/**
 * Subscribe to OS reduced-motion changes. Invokes `cb` with the current
 * preference whenever it flips. Returns an unsubscribe; the unsubscribe is a
 * no-op when matchMedia (or change subscription) is unavailable.
 */
export function onReducedMotionChange(
  cb: (reduced: boolean) => void,
  win?: { matchMedia?: (q: string) => { matches: boolean } },
): () => void {
  const target = resolveWindow(win);
  if (!target || typeof target.matchMedia !== 'function') return () => {};

  const query = target.matchMedia(REDUCE_MOTION_QUERY) as MediaQueryLike;
  const listener = (): void => cb(query.matches);

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }

  if (typeof query.addListener === 'function') {
    query.addListener(listener);
    return () => query.removeListener?.(listener);
  }

  return () => {};
}
