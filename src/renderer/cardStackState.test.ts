import { describe, expect, it } from 'vitest';
import type { KickbacksCard } from '../shared/workspaceModel';
import { bringCardToFrontState } from './cardStackState';

const cards: KickbacksCard[] = [
  {
    id: 'terminal-card',
    kind: 'terminal',
    rect: { height: 100, width: 100, x: 0, y: 0 },
    title: 'Terminal',
    zIndex: 5,
  },
  {
    id: 'sponsor-card',
    kind: 'sponsor',
    rect: { height: 100, width: 100, x: 0, y: 0 },
    title: 'Sponsor',
    zIndex: 3,
  },
];

describe('card stack state', () => {
  it('does not mutate cards when the target is already topmost', () => {
    const result = bringCardToFrontState(cards, 'terminal-card');

    expect(result.changed).toBe(false);
    expect(result.cards).toBe(cards);
    expect(result.primaryTerminalCardId).toBe('terminal-card');
  });

  it('raises the target above the current top card', () => {
    const result = bringCardToFrontState(cards, 'sponsor-card');

    expect(result.changed).toBe(true);
    expect(result.cards.find((card) => card.id === 'sponsor-card')?.zIndex).toBe(
      6,
    );
    expect(result.primaryTerminalCardId).toBeNull();
  });

  it('selects a raised terminal as primary', () => {
    const result = bringCardToFrontState(
      [
        { ...cards[0], zIndex: 1 },
        { ...cards[1], zIndex: 3 },
      ],
      'terminal-card',
    );

    expect(result.changed).toBe(true);
    expect(result.primaryTerminalCardId).toBe('terminal-card');
  });
});
