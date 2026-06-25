import type { Terminal } from '@xterm/xterm';

/**
 * Faithful port of upstream's
 * src/renderer/features/workspace/terminalClipboard.ts (commit d840933).
 *
 * The pure helpers stay framework-free and DOM-free so they can be unit tested
 * without xterm, electron, or a real clipboard. `createTerminalClipboard` is a
 * thin attach layer that mirrors how TerminalView.tsx wired the helpers in CD:
 * it intercepts the copy/paste key chords via attachCustomKeyEventHandler and
 * also handles the host element's native `copy`/`paste` events.
 */

export interface TerminalSelectionLike {
  hasSelection(): boolean;
  getSelection(): string;
}

export interface TerminalClipboardLike extends TerminalSelectionLike {
  paste(text: string): void;
}

export interface TerminalCopyKeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export type ClipboardWriter = (text: string) => Promise<void> | void;
export type ClipboardReader = () => Promise<string> | string;

export interface TerminalClipboardAccess {
  readText?: ClipboardReader;
  writeText?: ClipboardWriter;
}

/**
 * Normalize a paste payload for a PTY: collapse CRLF/CR/LF to a single CR, which
 * is what a real terminal emits when you press Enter. This matches Control
 * Deck's mechanism exactly (newlines become \r, not \n).
 */
export function normalizePastePayload(text: string): string {
  return text.replace(/\r?\n/g, '\r');
}

/**
 * Wrap a paste payload in bracketed-paste markers when the terminal has
 * bracketed paste mode enabled, otherwise return the normalized payload raw.
 */
export function bracketedPaste(
  text: string,
  bracketedPasteMode: boolean,
): string {
  const normalized = normalizePastePayload(text);
  return bracketedPasteMode
    ? `\x1b[200~${normalized}\x1b[201~`
    : normalized;
}

/**
 * upstream's original export name. Identical to `bracketedPaste`; kept so
 * call sites ported verbatim from CD continue to compile.
 */
export function clipboardTextForTerminalPaste(
  text: string,
  bracketedPasteMode: boolean,
): string {
  return bracketedPaste(text, bracketedPasteMode);
}

/**
 * Resolve the text to put on the clipboard for a terminal copy.
 *
 * Accepts either an xterm-like selection source (CD's original signature) or a
 * raw selection string (the contract signature). Faithful to CD: the text is
 * returned as-is when a selection exists and `undefined` when it does not.
 * CD does not trim, so neither do we.
 */
export function terminalCopyText(
  source: TerminalSelectionLike | string,
): string | undefined {
  if (typeof source === 'string') {
    return source ? source : undefined;
  }
  if (!source.hasSelection()) return undefined;
  const selection = source.getSelection();
  return selection ? selection : undefined;
}

/**
 * True for the bare copy chord: Ctrl+C or (mac) Cmd+C, without Shift/Alt.
 *
 * Note: CD treats a bare Ctrl+C as "copy" only when there is a selection. The
 * chord predicate itself is selection-agnostic; the SIGINT-preserving rule
 * lives in `classifyClipboardKey`/`handleTerminalClipboardKey`, which decline
 * to copy (and let xterm send the interrupt) when nothing is selected.
 */
export function isCopyChord(event: TerminalCopyKeyEventLike): boolean {
  return (
    event.key.toLowerCase() === 'c' &&
    (event.ctrlKey === true || event.metaKey === true) &&
    event.shiftKey !== true &&
    event.altKey !== true
  );
}

/** True for the bare paste chord: Ctrl+V or (mac) Cmd+V, without Shift/Alt. */
export function isPasteChord(event: TerminalCopyKeyEventLike): boolean {
  return (
    event.key.toLowerCase() === 'v' &&
    (event.ctrlKey === true || event.metaKey === true) &&
    event.shiftKey !== true &&
    event.altKey !== true
  );
}

export interface ClassifyClipboardKeyOptions {
  hasSelection: boolean;
}

/**
 * Classify a key event as a clipboard intent, applying CD's SIGINT rule: a bare
 * Ctrl+C with no selection is NOT a copy (returns null) so xterm forwards the
 * interrupt to the running process. With a selection it is a copy.
 */
export function classifyClipboardKey(
  event: TerminalCopyKeyEventLike,
  options: ClassifyClipboardKeyOptions,
): 'copy' | 'paste' | null {
  if (isPasteChord(event)) return 'paste';
  if (isCopyChord(event)) return options.hasSelection ? 'copy' : null;
  return null;
}

/**
 * Custom xterm key handler. Returns `true` to let xterm process the event
 * normally, `false` to swallow it (CD's attachCustomKeyEventHandler contract).
 *
 * - Paste chord: intercept and paste from the injected reader; if no reader is
 *   available, fall through (`true`) so native paste can still occur.
 * - Copy chord: intercept only when a selection exists, otherwise fall through
 *   so a bare Ctrl+C still sends SIGINT.
 */
export function handleTerminalClipboardKey(
  event: TerminalCopyKeyEventLike,
  terminal: TerminalClipboardLike,
  clipboard: TerminalClipboardAccess,
): boolean {
  if (isPasteChord(event)) {
    if (!clipboard.readText) return true;
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(clipboard.readText()).then((text) => {
      if (text) terminal.paste(text);
    });
    return false;
  }

  if (isCopyChord(event)) {
    const selection = terminalCopyText(terminal);
    if (!selection) return true;
    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(clipboard.writeText?.(selection));
    return false;
  }

  return true;
}

export interface CreateTerminalClipboardOptions {
  /** The xterm terminal whose selection/paste/key handling we hook. */
  terminal: Terminal;
  /** The DOM element hosting the terminal (xterm's mount container). */
  host: HTMLElement;
  /**
   * Send normalized text to the PTY. The text is already bracketed/normalized
   * by the time it reaches here.
   */
  writeToPty: (data: string) => void;
  /** Read the system clipboard. Omit to fall back to native paste. */
  readClipboard?: ClipboardReader;
  /** Write the system clipboard. Omit to skip programmatic copy. */
  writeClipboard?: ClipboardWriter;
}

/**
 * Attach copy/paste handling to a live terminal, mirroring TerminalView.tsx in
 * upstream. Returns a detach function that removes every listener.
 */
export function createTerminalClipboard({
  terminal,
  host,
  writeToPty,
  readClipboard,
  writeClipboard,
}: CreateTerminalClipboardOptions): () => void {
  const access: TerminalClipboardAccess = {
    ...(readClipboard ? { readText: readClipboard } : {}),
    ...(writeClipboard ? { writeText: writeClipboard } : {}),
  };

  terminal.attachCustomKeyEventHandler((event) =>
    handleTerminalClipboardKey(event, terminal, access),
  );

  const handleCopy = (event: ClipboardEvent) => {
    const selection = terminalCopyText(terminal);
    if (!selection) return;
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', selection);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    writeToPty(bracketedPaste(text, terminal.modes.bracketedPasteMode));
  };

  host.addEventListener('copy', handleCopy);
  host.addEventListener('paste', handlePaste);

  return () => {
    host.removeEventListener('copy', handleCopy);
    host.removeEventListener('paste', handlePaste);
    // xterm has no detach for custom key handlers; replace it with a pass-through
    // so a stale closure cannot keep intercepting events after teardown.
    terminal.attachCustomKeyEventHandler(() => true);
  };
}
