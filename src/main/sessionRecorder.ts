import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';

/**
 * Mirrors a PTY's output into a headless xterm so the current screen and
 * scrollback can be replayed as a compact VT sequence on reattach (the same
 * approach VS Code's terminal reconnect uses). Inline TUIs (codex, claude)
 * restore exactly; full-screen alternate-buffer apps repaint on next resize.
 *
 * Ported from upstream's `src/main/pty/manager.ts` recorder/replay logic
 * (persistent terminals + flush-before-replay). The mechanism is preserved
 * verbatim: a serialized write-empty drains the parser before SerializeAddon
 * runs, serialize() chains on a single promise so concurrent callers are safe,
 * and a byte-budget/interval compaction rebuilds the headless terminal from a
 * snapshot so long-lived sessions stay bounded.
 */
export interface SessionRecorderOptions {
  cols: number;
  rows: number;
  /** Scrollback lines to keep. Match the renderer xterm so reattach restores history. */
  scrollback?: number;
}

export interface SessionRecorder {
  feed(data: string): void;
  resize(cols: number, rows: number): void;
  /** Serialize the screen + scrollback once all fed bytes are parsed. */
  serialize(): Promise<string>;
  dispose(): void;
}

/** Matches a renderer xterm's default scrollback so reattach restores shell history. */
export const DEFAULT_RECORDER_SCROLLBACK = 5000;

/**
 * Approximate byte budget for the recorder's raw PTY output buffer. When
 * exceeded, the recorder compacts itself by serializing the current screen +
 * scrollback into a compact VT sequence and rebuilding the headless terminal
 * from that snapshot. This prevents long-lived persistent shell sessions from
 * growing memory unbounded while keeping replay intact.
 */
export const RECORDER_BYTE_BUDGET = 8 * 1024 * 1024;
/** Maximum time between recorder compactions for long-lived sessions. */
export const RECORDER_COMPACTION_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Pure helper: scrollback for a terminal profile. Inline CLI agents repaint
 * their own UI on attach, so they need no recorder scrollback (0); plain
 * shells keep the default history so reattach restores the buffer. Mirrors
 * upstream's `recorderScrollbackForContext` without depending on its
 * request types, so callers pass a plain kind string.
 */
export function recorderScrollbackForKind(
  profileKind: string | undefined,
  defaultScrollback = DEFAULT_RECORDER_SCROLLBACK,
): number {
  switch (profileKind) {
    case 'codex-cli':
    case 'cursor-agent-cli':
    case 'claude-code-cli':
    case 'opencode-cli':
      return 0;
    case 'shell':
    default:
      return defaultScrollback;
  }
}

/**
 * Build the headless mirror terminal with the SAME Unicode width table the
 * live renderer uses (the renderer loads Unicode 11). xterm's built-in table
 * is older, so without this the recorder would size wide glyphs (emoji, CJK)
 * one cell narrower than they appear on screen; the serialized replay sent on
 * reattach would then paint everything after such a glyph a column off and
 * smear it. Both the initial build and post-compaction rebuild share this so
 * they can never drift apart. allowProposedApi is required by the Unicode 11
 * addon.
 */
export function createRecorderTerminal(
  cols: number,
  rows: number,
  scrollback: number,
): { term: HeadlessTerminal; serializer: SerializeAddon } {
  const term = new HeadlessTerminal({
    cols,
    rows,
    scrollback,
    allowProposedApi: true,
  });
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  const serializer = new SerializeAddon();
  term.loadAddon(serializer);
  return { term, serializer };
}

export function createSessionRecorder(
  opts: SessionRecorderOptions,
): SessionRecorder {
  const baseCols = Math.max(opts.cols, 1);
  const baseRows = Math.max(opts.rows, 1);
  const baseScrollback = Math.max(
    opts.scrollback ?? DEFAULT_RECORDER_SCROLLBACK,
    0,
  );

  let { term, serializer } = createRecorderTerminal(
    baseCols,
    baseRows,
    baseScrollback,
  );
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;
  let broken = false;
  let currentCols = baseCols;
  let currentRows = baseRows;
  let fedBytes = 0;
  let lastCompaction = Date.now();

  const enqueue = <T>(run: () => T | Promise<T>): Promise<T> => {
    const next = chain.then(() => {
      if (disposed || broken) {
        return undefined as T;
      }
      return Promise.resolve(run());
    });
    chain = next.then(
      () => undefined,
      (error) => {
        broken = true;
        console.warn(
          '[recorder] session recorder failed; replay disabled for session',
          error,
        );
        try {
          term.dispose();
        } catch {
          // already torn down
        }
        return undefined;
      },
    );
    return next;
  };

  const writeQueued = (data: string): Promise<void> =>
    enqueue(
      () =>
        new Promise<void>((resolve, reject) => {
          try {
            term.write(data, () => resolve());
          } catch (error) {
            reject(error);
          }
        }),
    );

  const recreateFromSnapshot = (snapshot: string): Promise<void> => {
    try {
      term.dispose();
    } catch {
      // already torn down
    }
    const rebuilt = createRecorderTerminal(
      currentCols,
      currentRows,
      baseScrollback,
    );
    term = rebuilt.term;
    serializer = rebuilt.serializer;
    fedBytes = snapshot.length;
    lastCompaction = Date.now();
    if (!snapshot) return Promise.resolve();
    // Await the parser callback so the next queued operation sees the
    // fully-reparsed snapshot, not a half-built buffer.
    return new Promise<void>((resolve) => {
      term.write(snapshot, () => resolve());
    });
  };

  const compactQueued = (): Promise<void> =>
    enqueue(async () => {
      if (disposed || broken) return;
      try {
        await recreateFromSnapshot(serializer.serialize());
      } catch (error) {
        console.warn(
          '[recorder] recorder compaction failed; continuing with full buffer',
          error,
        );
      }
    });

  const maybeCompact = (dataLength: number): void => {
    fedBytes += dataLength;
    const now = Date.now();
    if (
      fedBytes >= RECORDER_BYTE_BUDGET ||
      now - lastCompaction >= RECORDER_COMPACTION_INTERVAL_MS
    ) {
      void compactQueued();
    }
  };

  return {
    feed: (data) => {
      void writeQueued(data);
      maybeCompact(data.length);
    },
    resize: (nextCols, nextRows) => {
      currentCols = Math.max(nextCols, 1);
      currentRows = Math.max(nextRows, 1);
      void enqueue(() => {
        term.resize(currentCols, currentRows);
      });
    },
    serialize: () =>
      writeQueued('').then(() => {
        if (disposed || broken) return '';
        return serializer.serialize();
      }),
    dispose: () => {
      disposed = true;
      term.dispose();
    },
  };
}
