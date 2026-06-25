/**
 * OSC 133 (FTCS) shell-integration support for the terminal.
 *
 * A shell-integration script (or oh-my-posh / starship with shell_integration
 * enabled) emits `OSC 133 ; A/B/C/D ... ST` marks around every prompt. Each
 * prompt start (`A`) gets a small gutter-dot decoration colored by the
 * PREVIOUS command's exit code, surfaced via the injected `colorForExit`.
 */

import type { Terminal } from '@xterm/xterm';

export type Osc133Mark = {
  kind: 'A' | 'B' | 'C' | 'D';
  exitCode?: number;
};

/**
 * Parse the payload of an `OSC 133 ; <payload> ST` sequence.
 *
 * Returns `null` for anything that is not an A/B/C/D mark. Extra
 * `;`-separated params (oh-my-posh / starship emit some, e.g.
 * `A;special_key=1`) are tolerated; only `D`'s first param is read as an
 * exit code, and only when it parses to a finite integer. The parser is pure
 * and has no terminal dependencies.
 */
export function parseOsc133Payload(payload: string): Osc133Mark | null {
  const [mark, ...params] = payload.split(';');
  switch (mark) {
    case 'A':
    case 'B':
    case 'C':
      return { kind: mark };
    case 'D': {
      const exitCode = Number.parseInt(params[0] ?? '', 10);
      return Number.isFinite(exitCode) ? { kind: 'D', exitCode } : { kind: 'D' };
    }
    default:
      return null;
  }
}

export interface ShellIntegrationOptions {
  /**
   * Resolve the gutter-dot color for the previous command's exit code.
   * `undefined` means "no command finished since the last prompt" (treat as
   * a neutral/ok dot). Non-zero codes typically map to a failure color.
   */
  colorForExit: (code: number | undefined) => string;
}

function styleGutterDot(element: HTMLElement, color: string): void {
  element.style.width = '6px';
  element.style.height = '6px';
  element.style.borderRadius = '50%';
  element.style.background = color;
  element.style.marginTop = '5px';
  element.style.marginLeft = '-8px';
  element.style.pointerEvents = 'none';
}

/**
 * Register the OSC 133 handler + prompt gutter decorations on a terminal.
 *
 * Returns a detach function that disposes the OSC handler first, then every
 * decoration it created. Call it before `terminal.dispose()`.
 */
export function attachShellIntegrationDecorations(
  terminal: Terminal,
  opts: ShellIntegrationOptions,
): () => void {
  // Exit code of the most recent `133;D` — the D for command N arrives just
  // before the `133;A` of prompt N+1, so it colors that next prompt's dot.
  let lastExitCode: number | undefined;
  const live = new Set<{ dispose(): void }>();

  const addPromptDot = () => {
    const marker = terminal.registerMarker(0);
    if (!marker) return;
    const color = opts.colorForExit(lastExitCode);
    const decoration = terminal.registerDecoration({ marker, width: 1 });
    if (!decoration) return;
    live.add(decoration);
    decoration.onRender((element) => styleGutterDot(element, color));
    // xterm disposes decorations when their marker scrolls out of the
    // scrollback; drop our reference so the set cannot grow unbounded.
    decoration.onDispose(() => live.delete(decoration));
  };

  const oscHandler = terminal.parser.registerOscHandler(133, (data) => {
    const mark = parseOsc133Payload(data);
    if (!mark) return true; // consume malformed 133 payloads; never leak them
    if (mark.kind === 'D') {
      lastExitCode = mark.exitCode;
    } else if (mark.kind === 'A') {
      addPromptDot();
      // Each dot reflects only the D received since the previous prompt.
      lastExitCode = undefined;
    }
    return true;
  });

  return () => {
    oscHandler.dispose();
    for (const decoration of [...live]) {
      decoration.dispose();
    }
    live.clear();
  };
}
