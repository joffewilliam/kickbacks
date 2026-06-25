export interface UserSettingsInput {
  name?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  stripeEmail?: string;
}

export interface UserSettings {
  name: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  stripeEmail: string;
  payoutProvider: 'stripe';
  payoutStatus: 'not_connected' | 'pending' | 'connected';
  revenueSharePercent: 50;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  name: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'US',
  stripeEmail: '',
  payoutProvider: 'stripe',
  payoutStatus: 'not_connected',
  revenueSharePercent: 50,
};

export function normalizeUserSettings(
  input: UserSettingsInput = {},
): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    name: text(input.name),
    email: text(input.email),
    addressLine1: text(input.addressLine1),
    addressLine2: text(input.addressLine2),
    city: text(input.city),
    region: text(input.region),
    postalCode: text(input.postalCode),
    country: country(input.country),
    stripeEmail: text(input.stripeEmail),
  };
}

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function country(value: string | undefined): string {
  const normalized = text(value).toUpperCase();
  return normalized || DEFAULT_USER_SETTINGS.country;
}
