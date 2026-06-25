import { describe, expect, it } from 'vitest';
import {
  defaultKickbacksDeck,
  settingsSections,
  workspaceCardKinds,
} from './workspaceModel';

describe('Kickbacks single-deck workspace model', () => {
  it('starts with one deck canvas and terminal/sponsor/ledger cards', () => {
    const deck = defaultKickbacksDeck();

    expect(deck.id).toBe('kickbacks-home');
    expect(deck.name).toBe('Kickbacks');
    expect(workspaceCardKinds(deck)).toEqual([
      'terminal',
      'sponsor',
      'verified-events',
    ]);
  });

  it('keeps payout/profile/address out of the canvas and inside settings', () => {
    const deck = defaultKickbacksDeck();

    expect(workspaceCardKinds(deck)).not.toContain('account');
    expect(workspaceCardKinds(deck)).not.toContain('address');
    expect(workspaceCardKinds(deck)).not.toContain('payout');
    expect(settingsSections.map((section) => section.id)).toEqual([
      'account',
      'address',
      'payout',
      'privacy',
      'terminal',
    ]);
  });
});
