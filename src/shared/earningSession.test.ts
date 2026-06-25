import { describe, expect, it } from 'vitest';
import {
  earningStateForSession,
  normalizeProviderSelection,
} from './earningSession';

describe('earning session state', () => {
  it('normalizes only supported AI provider selections', () => {
    expect(normalizeProviderSelection('Claude')).toBe('claude');
    expect(normalizeProviderSelection('codex')).toBe('codex');
    expect(normalizeProviderSelection('cursor')).toBe('cursor');
    expect(normalizeProviderSelection('powershell')).toBe('unknown');
  });

  it('enables earning for logged-in users with consent while provider detection stays automatic', () => {
    expect(
      earningStateForSession({
        isLoggedIn: true,
        privacyConsent: true,
      }),
    ).toEqual({
      eligible: true,
      reason: 'eligible',
      label: 'Earning mode on',
    });
  });

  it('keeps blank terminals usable when account or consent state blocks earning', () => {
    expect(
      earningStateForSession({
        isLoggedIn: false,
        privacyConsent: true,
      }),
    ).toMatchObject({
      eligible: false,
      reason: 'signed-out',
    });
    expect(
      earningStateForSession({
        isLoggedIn: true,
        privacyConsent: false,
      }),
    ).toMatchObject({
      eligible: false,
      reason: 'privacy-consent-required',
    });
  });
});
