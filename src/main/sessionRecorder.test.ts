import { describe, expect, it } from 'vitest';
// NOTE: deliberately does NOT import createSessionRecorder/createRecorderTerminal
// — those pull in @xterm/headless, which is a native-ish ESM terminal that does
// not initialize cleanly under the vitest node environment. We exercise only the
// pure helpers here; the xterm-backed recorder is covered by integration use.
import {
  DEFAULT_RECORDER_SCROLLBACK,
  RECORDER_BYTE_BUDGET,
  RECORDER_COMPACTION_INTERVAL_MS,
  recorderScrollbackForKind,
} from './sessionRecorder';

describe('recorderScrollbackForKind', () => {
  it('keeps full scrollback for plain shells so reattach restores history', () => {
    expect(recorderScrollbackForKind('shell')).toBe(DEFAULT_RECORDER_SCROLLBACK);
  });

  it('falls back to the default scrollback for unknown kinds', () => {
    expect(recorderScrollbackForKind(undefined)).toBe(
      DEFAULT_RECORDER_SCROLLBACK,
    );
    expect(recorderScrollbackForKind('something-else')).toBe(
      DEFAULT_RECORDER_SCROLLBACK,
    );
  });

  it('uses no scrollback for inline CLI agents that repaint themselves', () => {
    for (const kind of [
      'codex-cli',
      'cursor-agent-cli',
      'claude-code-cli',
      'opencode-cli',
    ]) {
      expect(recorderScrollbackForKind(kind)).toBe(0);
    }
  });

  it('honors a caller-provided default scrollback', () => {
    expect(recorderScrollbackForKind('shell', 12_000)).toBe(12_000);
    expect(recorderScrollbackForKind(undefined, 12_000)).toBe(12_000);
    // Inline agents still pin to 0 regardless of the default.
    expect(recorderScrollbackForKind('codex-cli', 12_000)).toBe(0);
  });
});

describe('recorder compaction budget', () => {
  it('caps the raw output buffer at 8MB', () => {
    expect(RECORDER_BYTE_BUDGET).toBe(8 * 1024 * 1024);
  });

  it('compacts long-lived sessions at least every 5 minutes', () => {
    expect(RECORDER_COMPACTION_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});
