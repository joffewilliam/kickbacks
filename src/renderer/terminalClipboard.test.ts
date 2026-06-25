import { describe, expect, it, vi } from 'vitest';
import {
  bracketedPaste,
  classifyClipboardKey,
  clipboardTextForTerminalPaste,
  handleTerminalClipboardKey,
  isCopyChord,
  isPasteChord,
  normalizePastePayload,
  terminalCopyText,
} from './terminalClipboard';

function keyEvent(
  overrides: Partial<{
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }>,
) {
  return {
    key: 'c',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('terminal clipboard pure helpers', () => {
  it('normalizes CRLF and bare CR to a single CR for the PTY', () => {
    expect(normalizePastePayload('one\r\ntwo\rthree\nfour')).toBe(
      'one\rtwo\rthree\rfour',
    );
  });

  it('wraps multiline paste in bracketed paste markers when enabled', () => {
    expect(bracketedPaste('one\r\ntwo', true)).toBe(
      '\x1b[200~one\rtwo\x1b[201~',
    );
  });

  it('returns normalized text without markers when bracketed mode is off', () => {
    expect(bracketedPaste('one\ntwo', false)).toBe('one\rtwo');
  });

  it('keeps the CD alias clipboardTextForTerminalPaste behaving identically', () => {
    expect(clipboardTextForTerminalPaste('one\ntwo', false)).toBe('one\rtwo');
    expect(clipboardTextForTerminalPaste('one\ntwo', true)).toBe(
      '\x1b[200~one\rtwo\x1b[201~',
    );
  });

  it('copies selected terminal text only when a selection exists', () => {
    expect(
      terminalCopyText({
        hasSelection: () => true,
        getSelection: () => 'selected output',
      }),
    ).toBe('selected output');
    expect(
      terminalCopyText({
        hasSelection: () => false,
        getSelection: () => 'ignored',
      }),
    ).toBeUndefined();
  });

  it('accepts a raw selection string and ignores empty strings', () => {
    expect(terminalCopyText('selected output')).toBe('selected output');
    expect(terminalCopyText('')).toBeUndefined();
  });
});

describe('clipboard chord detection', () => {
  it('treats Ctrl+C and Cmd+C as copy chords but not when modified', () => {
    expect(isCopyChord(keyEvent({ key: 'c', ctrlKey: true }))).toBe(true);
    expect(isCopyChord(keyEvent({ key: 'C', metaKey: true }))).toBe(true);
    expect(isCopyChord(keyEvent({ key: 'c', ctrlKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(isCopyChord(keyEvent({ key: 'c', ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(isCopyChord(keyEvent({ key: 'c' }))).toBe(false);
  });

  it('treats Ctrl+V and Cmd+V as paste chords (mac vs non-mac)', () => {
    expect(isPasteChord(keyEvent({ key: 'v', ctrlKey: true }))).toBe(true);
    expect(isPasteChord(keyEvent({ key: 'v', metaKey: true }))).toBe(true);
    expect(isPasteChord(keyEvent({ key: 'v', ctrlKey: true, shiftKey: true }))).toBe(
      false,
    );
  });

  it('does NOT classify bare Ctrl+C as copy when there is no selection (SIGINT)', () => {
    expect(
      classifyClipboardKey(keyEvent({ key: 'c', ctrlKey: true }), {
        hasSelection: false,
      }),
    ).toBeNull();
  });

  it('classifies Ctrl+C with a selection as copy', () => {
    expect(
      classifyClipboardKey(keyEvent({ key: 'c', ctrlKey: true }), {
        hasSelection: true,
      }),
    ).toBe('copy');
  });

  it('classifies the paste chord regardless of selection', () => {
    expect(
      classifyClipboardKey(keyEvent({ key: 'v', metaKey: true }), {
        hasSelection: false,
      }),
    ).toBe('paste');
  });
});

describe('handleTerminalClipboardKey', () => {
  it('intercepts the paste chord and pastes the clipboard contents', async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const paste = vi.fn();
    const readText = vi.fn().mockResolvedValue('pasted secret');

    const allowXterm = handleTerminalClipboardKey(
      {
        key: 'v',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault,
        stopPropagation,
      },
      { hasSelection: () => false, getSelection: () => '', paste },
      { readText, writeText: vi.fn() },
    );

    expect(allowXterm).toBe(false);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    await Promise.resolve();
    expect(readText).toHaveBeenCalled();
    expect(paste).toHaveBeenCalledWith('pasted secret');
  });

  it('lets the paste chord fall back to native paste when no reader is wired', () => {
    const paste = vi.fn();

    const allowXterm = handleTerminalClipboardKey(
      keyEvent({ key: 'v', ctrlKey: true }),
      { hasSelection: () => false, getSelection: () => '', paste },
      { writeText: vi.fn() },
    );

    expect(allowXterm).toBe(true);
    expect(paste).not.toHaveBeenCalled();
  });

  it('lets bare Ctrl+C through to xterm when nothing is selected', () => {
    const writeText = vi.fn();
    const event = keyEvent({ key: 'c', ctrlKey: true });

    const allowXterm = handleTerminalClipboardKey(
      event,
      { hasSelection: () => false, getSelection: () => '', paste: vi.fn() },
      { readText: vi.fn(), writeText },
    );

    expect(allowXterm).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('intercepts Ctrl+C with a selection and copies before xterm sends interrupt', async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);

    const allowXterm = handleTerminalClipboardKey(
      {
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault,
        stopPropagation,
      },
      {
        hasSelection: () => true,
        getSelection: () => 'selected output',
        paste: vi.fn(),
      },
      { readText: vi.fn(), writeText },
    );

    expect(allowXterm).toBe(false);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('selected output');
  });
});
