import { describe, expect, it } from 'vitest';
import {
  captureScrollAnchor,
  rememberScrollAnchor,
  resolveScrollTop,
  shouldRestoreAfterTerminalWrite,
} from './terminalScrollState';

describe('terminal scroll anchoring', () => {
  it('keeps the terminal pinned to the bottom when it was already at the bottom', () => {
    const anchor = captureScrollAnchor({
      clientHeight: 200,
      scrollHeight: 1_000,
      scrollTop: 798,
    });

    expect(anchor).toEqual({ mode: 'bottom' });
    expect(
      resolveScrollTop(anchor, {
        clientHeight: 240,
        scrollHeight: 1_400,
      }),
    ).toBe(1_160);
  });

  it('preserves a scrollback position when the user is reading history', () => {
    const anchor = captureScrollAnchor({
      clientHeight: 200,
      scrollHeight: 1_000,
      scrollTop: 320,
    });

    expect(anchor).toEqual({ mode: 'scrollback', scrollTop: 320 });
    expect(
      resolveScrollTop(anchor, {
        clientHeight: 180,
        scrollHeight: 1_100,
      }),
    ).toBe(320);
  });

  it('clamps scrollback anchors to the available scroll range', () => {
    const anchor = { mode: 'scrollback' as const, scrollTop: 900 };

    expect(
      resolveScrollTop(anchor, {
        clientHeight: 240,
        scrollHeight: 1_000,
      }),
    ).toBe(760);
  });

  it('does not fight xterm output when already pinned to the bottom', () => {
    expect(shouldRestoreAfterTerminalWrite({ mode: 'bottom' })).toBe(false);
    expect(
      shouldRestoreAfterTerminalWrite({
        mode: 'scrollback',
        scrollTop: 240,
      }),
    ).toBe(true);
  });

  it('keeps the last good anchor when a resize frame has no measurable scroll range', () => {
    const previous = { mode: 'scrollback' as const, scrollTop: 420 };

    expect(rememberScrollAnchor(previous, null)).toBe(previous);
    expect(rememberScrollAnchor(previous, { mode: 'bottom' })).toEqual({
      mode: 'bottom',
    });
  });
});
