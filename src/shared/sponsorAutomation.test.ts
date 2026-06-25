import { describe, expect, it } from 'vitest';
import {
  nextAutomaticSponsorAdPollState,
  shouldServeAutomaticSponsorAd,
} from './sponsorAutomation';

describe('automatic sponsor ad serving', () => {
  it('serves automatically only while model activity is payable', () => {
    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: null,
        now: 10_000,
        payable: true,
      }),
    ).toBe(true);

    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: null,
        now: 10_000,
        payable: false,
      }),
    ).toBe(false);
  });

  it('does not serve when earning mode or terminal ownership is missing', () => {
    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: null,
        eligible: true,
        lastServedAt: null,
        now: 10_000,
        payable: true,
      }),
    ).toBe(false);

    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: 'terminal-1',
        eligible: false,
        lastServedAt: null,
        now: 10_000,
        payable: true,
      }),
    ).toBe(false);
  });

  it('rate limits repeated automatic impressions during a long turn', () => {
    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: 10_000,
        minIntervalMs: 30_000,
        now: 39_999,
        payable: true,
      }),
    ).toBe(false);

    expect(
      shouldServeAutomaticSponsorAd({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: 10_000,
        minIntervalMs: 30_000,
        now: 40_000,
        payable: true,
      }),
    ).toBe(true);
  });

  it('serves again immediately when a later thinking run starts after idle', () => {
    const idle = nextAutomaticSponsorAdPollState({
      activeTerminalId: 'terminal-1',
      eligible: true,
      lastServedAt: 10_000,
      now: 16_000,
      payable: false,
    });

    expect(idle).toEqual({
      lastServedAt: null,
      serve: false,
    });

    expect(
      nextAutomaticSponsorAdPollState({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: idle.lastServedAt,
        now: 17_000,
        payable: true,
      }),
    ).toEqual({
      lastServedAt: 17_000,
      serve: true,
    });
  });

  it('allows interval refreshes during a long payable run', () => {
    expect(
      nextAutomaticSponsorAdPollState({
        activeTerminalId: 'terminal-1',
        eligible: true,
        lastServedAt: 10_000,
        minIntervalMs: 30_000,
        now: 40_000,
        payable: true,
      }),
    ).toEqual({
      lastServedAt: 40_000,
      serve: true,
    });
  });
});
