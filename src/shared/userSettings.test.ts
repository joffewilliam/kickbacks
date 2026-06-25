import { describe, expect, it } from 'vitest';
import { normalizeUserSettings } from './userSettings';

describe('user-facing settings', () => {
  it('normalizes profile and payout settings without requiring real Stripe setup', () => {
    expect(
      normalizeUserSettings({
        name: '  Ada Lovelace  ',
        email: ' ada@example.com ',
        addressLine1: '  1 Loop Street ',
        addressLine2: '',
        city: ' London ',
        region: '',
        postalCode: ' W1 ',
        country: ' gb ',
        stripeEmail: ' payouts@example.com ',
      }),
    ).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      addressLine1: '1 Loop Street',
      addressLine2: '',
      city: 'London',
      region: '',
      postalCode: 'W1',
      country: 'GB',
      stripeEmail: 'payouts@example.com',
      payoutProvider: 'stripe',
      payoutStatus: 'not_connected',
      revenueSharePercent: 50,
    });
  });
});
