/**
 * Pure decision helpers for persistent PTY sessions. The side-effecting glue
 * (spawn, recorder, send) lives in the main process; the bookkeeping decisions
 * are isolated here so they can be unit-tested without Electron.
 *
 * Lifecycle: a session is keyed by its renderer card id. On unmount the renderer
 * DETACHES (keeps the process alive) rather than killing, so a remount — e.g.
 * React StrictMode's double-invoke — reattaches to the same process instead of
 * spawning a second one. A reaper kills detached sessions whose card is gone.
 */

export type PtyDataDisposition = 'send' | 'buffer' | 'drop';

/**
 * Decide what to do with a chunk of PTY output for the renderer. The recorder
 * is always fed separately; this governs only forwarding:
 * - `buffer` while a replay is serializing (so mid-serialize bytes aren't lost),
 * - `send` when attached and not replaying,
 * - `drop` (renderer not listening) when detached.
 */
export function ptyDataDisposition(state: {
  attached: boolean;
  replaying: boolean;
}): PtyDataDisposition {
  if (state.replaying) return 'buffer';
  return state.attached ? 'send' : 'drop';
}

export interface ReapableSession {
  id: string;
  key?: string;
}

/**
 * Ids of keyed sessions whose card is no longer present — orphans safe to kill.
 * The reaper is driven by deck changes; a StrictMode remount does NOT change the
 * deck, so a session being temporarily detached mid-remount is never reaped (its
 * card is still live). Therefore attachment state is intentionally not consulted
 * here: if a card is gone, its session goes too. Unkeyed one-off sessions are
 * never reaped.
 */
export function sessionsToReap(
  sessions: Iterable<ReapableSession>,
  liveCardIds: Iterable<string>,
): string[] {
  const live = new Set(liveCardIds);
  const reap: string[] = [];
  for (const session of sessions) {
    if (session.key === undefined) continue;
    if (!live.has(session.key)) reap.push(session.id);
  }
  return reap;
}
