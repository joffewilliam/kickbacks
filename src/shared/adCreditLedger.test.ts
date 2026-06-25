import { describe, expect, it } from 'vitest';
import {
  FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR,
  createAdCreditLedger,
} from './adCreditLedger';
import {
  FIVE_SECOND_AD_CREDIT_USD,
  FIVE_SECOND_AD_RENDERED_MS,
  buildAdImpressionEvent,
} from './privacyTelemetry';

describe('ad credit ledger', () => {
  it('rejects impressions shorter than a completed 5 second ad interval', () => {
    const ledger = createAdCreditLedger();
    const response = ledger.retainImpression({
      input: impressionInput({ renderedMs: FIVE_SECOND_AD_RENDERED_MS - 1 }),
      provider: 'codex',
      now: Date.parse('2026-06-18T12:00:00.000Z'),
    });

    expect(response).toEqual({
      accepted: false,
      label: 'Ad display was under 5 seconds',
      reason: 'ad-duration-too-short',
      retainedEvents: 0,
    });
  });

  it('credits exactly one 5 second ad event at the 5 second boundary', () => {
    const ledger = createAdCreditLedger();
    const response = ledger.retainImpression({
      input: impressionInput({ renderedMs: FIVE_SECOND_AD_RENDERED_MS }),
      provider: 'codex',
      now: Date.parse('2026-06-18T12:00:00.000Z'),
    });

    expect(response.accepted).toBe(true);
    if (!response.accepted) return;
    expect(response.event.kind).toBe('ad.impression');
    expect(response.event.creditUsd).toBe(FIVE_SECOND_AD_CREDIT_USD);
    expect(response.retainedEvents).toBe(1);
  });

  it('enforces the hourly 5 second ad credit limit per user', () => {
    const ledger = createAdCreditLedger();
    const now = Date.parse('2026-06-18T12:00:00.000Z');
    for (let index = 0; index < FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR; index += 1) {
      const response = ledger.retainImpression({
        input: impressionInput({
          at: new Date(now - index * 1_000).toISOString(),
          renderedMs: FIVE_SECOND_AD_RENDERED_MS,
        }),
        provider: 'codex',
        now,
      });
      expect(response.accepted).toBe(true);
    }

    const capped = ledger.retainImpression({
      input: impressionInput({ renderedMs: FIVE_SECOND_AD_RENDERED_MS }),
      provider: 'codex',
      now,
    });

    expect(capped).toEqual({
      accepted: false,
      label: 'Hourly 5 second ad credit limit reached',
      reason: 'hourly-ad-limit',
      retainedEvents: FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR,
    });
  });

  it('retains only the latest 500 safe events', () => {
    const ledger = createAdCreditLedger();
    for (let index = 0; index < 501; index += 1) {
      ledger.retainClick({
        input: {
          advertiser: 'Neon',
          creativeId: `creative-${index}`,
          destinationUrl: 'https://kickbacks.ai/sponsors/neon',
          placement: 'sidebar',
          sessionId: 'session-1',
          terminalId: 'terminal-1',
          userId: 'user-1',
        },
        provider: 'codex',
      });
    }

    expect(ledger.list()).toHaveLength(500);
    expect(ledger.list()[0].creativeId).toBe('creative-1');
  });

  it('rejects duplicate click credits for the same opened sponsor link', () => {
    const ledger = createAdCreditLedger();
    const firstClick = ledger.retainClick({
      input: clickInput({ at: '2026-06-18T12:00:00.000Z' }),
      provider: 'codex',
    });

    const duplicateClick = ledger.retainClick({
      input: clickInput({ at: '2026-06-18T12:00:01.000Z' }),
      provider: 'codex',
    });

    expect(firstClick.accepted).toBe(true);
    expect(duplicateClick).toEqual({
      accepted: false,
      label: 'Sponsor click already credited',
      reason: 'duplicate-click',
      retainedEvents: 1,
    });
    expect(ledger.list()).toHaveLength(1);
  });

  it('allows another sponsor click after the duplicate click window', () => {
    const ledger = createAdCreditLedger();
    const firstClick = ledger.retainClick({
      input: clickInput({ at: '2026-06-18T12:00:00.000Z' }),
      provider: 'codex',
    });

    const laterClick = ledger.retainClick({
      input: clickInput({ at: '2026-06-18T12:00:06.000Z' }),
      provider: 'codex',
    });

    expect(firstClick.accepted).toBe(true);
    expect(laterClick.accepted).toBe(true);
    expect(ledger.list()).toHaveLength(2);
  });

  it('rejects unsafe retained event payloads', () => {
    const ledger = createAdCreditLedger();
    const unsafe = {
      ...buildAdImpressionEvent({
        ...impressionInput({ renderedMs: FIVE_SECOND_AD_RENDERED_MS }),
        provider: 'codex',
      }),
      terminalOutput: 'raw terminal output',
    };

    expect(() => ledger.retainEvent(unsafe)).toThrow(
      'Unsafe ad event rejected before retention.',
    );
  });
});

function impressionInput(overrides: Partial<Parameters<ReturnType<typeof createAdCreditLedger>['retainImpression']>[0]['input']> = {}) {
  return {
    advertiser: 'Neon',
    creativeId: 'creative-neon-001',
    placement: 'thinking-line' as const,
    renderedMs: FIVE_SECOND_AD_RENDERED_MS,
    sessionId: 'session-1',
    terminalId: 'terminal-1',
    userId: 'user-1',
    ...overrides,
  };
}

function clickInput(overrides: Partial<Parameters<ReturnType<typeof createAdCreditLedger>['retainClick']>[0]['input']> = {}) {
  return {
    advertiser: 'Neon',
    creativeId: 'creative-neon-001',
    destinationUrl: 'https://kickbacks.ai/sponsors/neon',
    placement: 'sidebar' as const,
    sessionId: 'session-1',
    terminalId: 'terminal-1',
    userId: 'user-1',
    ...overrides,
  };
}
