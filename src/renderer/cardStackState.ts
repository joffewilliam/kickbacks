import type { KickbacksCard } from '../shared/workspaceModel';

export interface BringCardToFrontResult {
  cards: readonly KickbacksCard[];
  changed: boolean;
  primaryTerminalCardId: string | null;
}

export function bringCardToFrontState(
  cards: readonly KickbacksCard[],
  cardId: string,
): BringCardToFrontResult {
  const maxZ = Math.max(...cards.map((card) => card.zIndex), 1);
  const target = cards.find((card) => card.id === cardId);
  if (!target) {
    return { cards, changed: false, primaryTerminalCardId: null };
  }
  const primaryTerminalCardId = target.kind === 'terminal' ? cardId : null;
  if (target.zIndex >= maxZ) {
    return { cards, changed: false, primaryTerminalCardId };
  }
  return {
    cards: cards.map((card) =>
      card.id === cardId ? { ...card, zIndex: maxZ + 1 } : card,
    ),
    changed: true,
    primaryTerminalCardId,
  };
}
