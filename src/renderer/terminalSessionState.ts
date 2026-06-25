import type { KickbacksCard } from '../shared/workspaceModel';
import type { PtyLaunchMode } from '../shared/ipc';

export type TerminalSessions = Record<string, string | null>;
export type TerminalLaunchStatus = PtyLaunchMode | 'exited';
export type TerminalLaunchModes = Record<string, TerminalLaunchStatus | null>;

export const DEFAULT_TERMINAL_CARD_ID = 'terminal-card';

export function defaultTerminalSessions(): TerminalSessions {
  return { [DEFAULT_TERMINAL_CARD_ID]: null };
}

export function defaultTerminalLaunchModes(): TerminalLaunchModes {
  return { [DEFAULT_TERMINAL_CARD_ID]: null };
}

export function terminalCardIds(cards: readonly KickbacksCard[]): Set<string> {
  return new Set(
    cards.filter((card) => card.kind === 'terminal').map((card) => card.id),
  );
}

export function updateKnownTerminalSession({
  cardId,
  knownCardIds,
  sessions,
  terminalId,
}: {
  cardId: string;
  knownCardIds: ReadonlySet<string>;
  sessions: TerminalSessions;
  terminalId: string | null;
}): TerminalSessions {
  if (!knownCardIds.has(cardId)) return sessions;
  return {
    ...sessions,
    [cardId]: terminalId,
  };
}

export function removeTerminalSession(
  sessions: TerminalSessions,
  cardId: string,
): TerminalSessions {
  const next = { ...sessions };
  delete next[cardId];
  return next;
}

export function updateTerminalLaunchMode({
  cardId,
  knownCardIds,
  launchMode,
  modes,
}: {
  cardId: string;
  knownCardIds: ReadonlySet<string>;
  launchMode: TerminalLaunchStatus | null;
  modes: TerminalLaunchModes;
}): TerminalLaunchModes {
  if (!knownCardIds.has(cardId)) return modes;
  return {
    ...modes,
    [cardId]: launchMode,
  };
}

export function removeTerminalLaunchMode(
  modes: TerminalLaunchModes,
  cardId: string,
): TerminalLaunchModes {
  const next = { ...modes };
  delete next[cardId];
  return next;
}

export function retainTerminalSessionsForCards({
  cardIds,
  sessions,
}: {
  cardIds: ReadonlySet<string>;
  sessions: TerminalSessions;
}): TerminalSessions {
  const next: TerminalSessions = {};
  for (const cardId of cardIds) {
    next[cardId] = sessions[cardId] ?? null;
  }
  return next;
}

export function retainTerminalLaunchModesForCards({
  cardIds,
  modes,
  sessions,
}: {
  cardIds: ReadonlySet<string>;
  modes: TerminalLaunchModes;
  sessions?: TerminalSessions;
}): TerminalLaunchModes {
  const next: TerminalLaunchModes = {};
  for (const cardId of cardIds) {
    next[cardId] = sessions && !sessions[cardId] ? null : modes[cardId] ?? null;
  }
  return next;
}

export function terminalLaunchModeLabel(
  launchMode: TerminalLaunchStatus | null | undefined,
): string {
  if (launchMode === 'codex-app-server') return 'Codex';
  if (launchMode === 'shell') return 'Shell fallback';
  if (launchMode === 'exited') return 'Exited';
  return 'Starting';
}

export function terminalCardIdForSession(
  sessions: TerminalSessions,
  terminalId: string,
): string | null {
  for (const [cardId, sessionTerminalId] of Object.entries(sessions)) {
    if (sessionTerminalId === terminalId) return cardId;
  }
  return null;
}

export function nextPrimaryTerminalCardId(
  cards: readonly KickbacksCard[],
  closingCardId: string,
): string | null {
  const candidates = cards
    .filter((card) => card.kind === 'terminal' && card.id !== closingCardId)
    .sort((a, b) => b.zIndex - a.zIndex);
  return candidates[0]?.id ?? null;
}

export function nextLiveTerminalCardId({
  cards,
  excludingCardId,
  sessions,
}: {
  cards: readonly KickbacksCard[];
  excludingCardId: string;
  sessions: TerminalSessions;
}): string | null {
  const candidates = cards
    .filter((card) => {
      if (card.kind !== 'terminal') return false;
      if (card.id === excludingCardId) return false;
      return Boolean(sessions[card.id]);
    })
    .sort((a, b) => b.zIndex - a.zIndex);
  return candidates[0]?.id ?? null;
}
