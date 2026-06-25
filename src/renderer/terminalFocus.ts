export interface TerminalFocusBoundary {
  contains(target: unknown): boolean;
}

export function terminalFocusBoundary(host: HTMLElement): TerminalFocusBoundary {
  return {
    contains: (target) =>
      typeof Node !== 'undefined' &&
      target instanceof Node &&
      host.contains(target),
  };
}

export function shouldBlurTerminalForPointerDown({
  host,
  activeElement,
  pointerTarget,
}: {
  host: TerminalFocusBoundary | null | undefined;
  activeElement: unknown;
  pointerTarget: unknown;
}): boolean {
  if (!host || !activeElement) return false;
  if (!host.contains(activeElement)) return false;
  return !host.contains(pointerTarget);
}
