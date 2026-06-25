export type TerminalScrollAnchor =
  | { mode: 'bottom' }
  | { mode: 'scrollback'; scrollTop: number };

export interface TerminalScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface TerminalScrollRange {
  clientHeight: number;
  scrollHeight: number;
}

const BOTTOM_THRESHOLD_PX = 6;

export function captureScrollAnchor(
  metrics: TerminalScrollMetrics,
): TerminalScrollAnchor | null {
  const maxScrollTop = maxScroll(metrics);
  if (maxScrollTop <= 0) return null;
  const distanceToBottom = maxScrollTop - metrics.scrollTop;
  if (distanceToBottom <= BOTTOM_THRESHOLD_PX) return { mode: 'bottom' };
  return {
    mode: 'scrollback',
    scrollTop: Math.max(0, metrics.scrollTop),
  };
}

export function resolveScrollTop(
  anchor: TerminalScrollAnchor | null,
  range: TerminalScrollRange,
): number | null {
  if (!anchor) return null;
  const maxScrollTop = maxScroll(range);
  if (maxScrollTop <= 0) return null;
  if (anchor.mode === 'bottom') return maxScrollTop;
  return Math.min(maxScrollTop, Math.max(0, anchor.scrollTop));
}

export function rememberScrollAnchor(
  previous: TerminalScrollAnchor | null,
  captured: TerminalScrollAnchor | null,
): TerminalScrollAnchor | null {
  return captured ?? previous;
}

export function shouldRestoreAfterTerminalWrite(
  anchor: TerminalScrollAnchor | null,
): boolean {
  return anchor?.mode === 'scrollback';
}

function maxScroll(range: TerminalScrollRange): number {
  return Math.max(0, range.scrollHeight - range.clientHeight);
}
