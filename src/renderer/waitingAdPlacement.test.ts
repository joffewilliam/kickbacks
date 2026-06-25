import { describe, expect, it } from 'vitest';
import {
  createWaitingAdPlacement,
  detectorTerminalIdForWaitingAd,
  isWaitingAdVisibleOnCard,
  isWaitingAdPlacementCurrent,
  shouldReplaceWaitingAdPlacement,
  type WaitingAdPlacement,
} from './waitingAdPlacement';

describe('waiting ad placement ownership', () => {
  it('does not create a placement until both card and terminal are known', () => {
    expect(createWaitingAdPlacement(null, 'terminal-1')).toBeNull();
    expect(createWaitingAdPlacement('terminal-card-1', null)).toBeNull();
  });

  it('keeps the waiting ad attached to the card that started it', () => {
    const placement = createWaitingAdPlacement('terminal-card-1', 'terminal-1');

    expect(placement).toEqual({
      cardId: 'terminal-card-1',
      terminalId: 'terminal-1',
    });
    expect(isWaitingAdVisibleOnCard(placement, 'terminal-card-1')).toBe(true);
    expect(isWaitingAdVisibleOnCard(placement, 'terminal-card-2')).toBe(false);
  });

  it('keeps the credited terminal independent from later primary-card changes', () => {
    const placement: WaitingAdPlacement = {
      cardId: 'terminal-card-1',
      terminalId: 'terminal-1',
    };

    expect(placement.terminalId).toBe('terminal-1');
    expect(isWaitingAdVisibleOnCard(placement, 'terminal-card-2')).toBe(false);
  });

  it('uses the waiting ad owner for detector status while an ad is active', () => {
    expect(
      detectorTerminalIdForWaitingAd(
        {
          cardId: 'terminal-card-1',
          terminalId: 'terminal-1',
        },
        'terminal-2',
      ),
    ).toBe('terminal-1');
    expect(detectorTerminalIdForWaitingAd(null, 'terminal-2')).toBe(
      'terminal-2',
    );
  });

  it('does not replace an active placement with the same owner', () => {
    const placement: WaitingAdPlacement = {
      cardId: 'terminal-card-1',
      terminalId: 'terminal-1',
    };

    expect(shouldReplaceWaitingAdPlacement(placement, placement)).toBe(false);
    expect(
      shouldReplaceWaitingAdPlacement(placement, {
        cardId: 'terminal-card-2',
        terminalId: 'terminal-2',
      }),
    ).toBe(true);
    expect(shouldReplaceWaitingAdPlacement(null, placement)).toBe(true);
  });

  it('checks that a scheduled credit still belongs to the active placement', () => {
    const placement: WaitingAdPlacement = {
      cardId: 'terminal-card-1',
      terminalId: 'terminal-1',
    };

    expect(isWaitingAdPlacementCurrent(placement, placement)).toBe(true);
    expect(isWaitingAdPlacementCurrent(null, placement)).toBe(false);
    expect(
      isWaitingAdPlacementCurrent(
        {
          cardId: 'terminal-card-2',
          terminalId: 'terminal-2',
        },
        placement,
      ),
    ).toBe(false);
  });
});
