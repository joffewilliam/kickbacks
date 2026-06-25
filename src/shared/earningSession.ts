export type EarnableProvider = 'claude' | 'codex' | 'cursor';
export type ProviderSelection = EarnableProvider | 'unknown';

export interface EarningSessionInput {
  isLoggedIn: boolean;
  privacyConsent: boolean;
}

export type EarningUnavailableReason =
  | 'signed-out'
  | 'privacy-consent-required';

export type EarningState =
  | {
      eligible: true;
      reason: 'eligible';
      label: 'Earning mode on';
    }
  | {
      eligible: false;
      reason: EarningUnavailableReason;
      label: string;
    };

const PROVIDERS: ReadonlySet<EarnableProvider> = new Set([
  'claude',
  'codex',
  'cursor',
]);

export function normalizeProviderSelection(value: string): ProviderSelection {
  const normalized = value.trim().toLowerCase();
  return PROVIDERS.has(normalized as EarnableProvider)
    ? (normalized as EarnableProvider)
    : 'unknown';
}

export function earningStateForSession(
  input: EarningSessionInput,
): EarningState {
  if (!input.isLoggedIn) {
    return {
      eligible: false,
      reason: 'signed-out',
      label: 'Sign in to earn',
    };
  }
  if (!input.privacyConsent) {
    return {
      eligible: false,
      reason: 'privacy-consent-required',
      label: 'Privacy consent required',
    };
  }
  return {
    eligible: true,
    reason: 'eligible',
    label: 'Earning mode on',
  };
}
