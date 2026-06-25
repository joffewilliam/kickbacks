import type { ProviderSelection } from './earningSession';
import type { TrustRiskSummary } from './trustScoring';

export type AdPlacement = 'thinking-line' | 'sidebar' | 'rewarded-video';

export interface UnsafeAdInput {
  terminalOutput?: unknown;
  command?: unknown;
  cwd?: unknown;
  promptText?: unknown;
  transcript?: unknown;
  projectPath?: unknown;
  [key: string]: unknown;
}

export interface BaseAdRequestInput extends UnsafeAdInput {
  userId: string;
  sessionId: string;
  terminalId: string;
  placement: AdPlacement;
  advertiser?: string;
  creativeId: string;
  trust?: TrustRiskSummary;
  at?: string;
}

export interface BaseAdEventInput extends BaseAdRequestInput {
  provider: ProviderSelection;
}

export interface AdImpressionInput extends BaseAdRequestInput {
  renderedMs: number;
}

export interface AdClickInput extends BaseAdRequestInput {
  destinationUrl: string;
}

export interface AdImpressionEventInput extends BaseAdEventInput {
  renderedMs: number;
}

export interface AdClickEventInput extends BaseAdEventInput {
  destinationUrl: string;
}

export interface AdImpressionEvent {
  kind: 'ad.impression';
  client: 'Kickbacks.ai';
  eventId: string;
  userId: string;
  sessionId: string;
  terminalId: string;
  provider: ProviderSelection;
  placement: AdPlacement;
  advertiser: string;
  creativeId: string;
  trust?: TrustRiskSummary;
  creditUsd: number;
  renderedMs: number;
  at: string;
}

export interface AdClickEvent {
  kind: 'ad.click';
  client: 'Kickbacks.ai';
  eventId: string;
  userId: string;
  sessionId: string;
  terminalId: string;
  provider: ProviderSelection;
  placement: AdPlacement;
  advertiser: string;
  creativeId: string;
  trust?: TrustRiskSummary;
  creditUsd: number;
  destinationUrl: string;
  at: string;
}

export type SafeAdEvent = AdImpressionEvent | AdClickEvent;

export const FIVE_SECOND_AD_RENDERED_MS = 5_000;
export const FIVE_SECOND_AD_CREDIT_USD = 0.005;
export const AD_CLICK_CREDIT_USD = 0.25;

const UNSAFE_FIELDS = new Set([
  'terminalOutput',
  'command',
  'cwd',
  'promptText',
  'transcript',
  'projectPath',
  'output',
  'stdout',
  'stderr',
  'buffer',
]);

export function buildAdImpressionEvent(
  input: AdImpressionEventInput,
): AdImpressionEvent {
  const renderedMs = Math.max(0, Math.round(input.renderedMs));
  return {
    kind: 'ad.impression',
    client: 'Kickbacks.ai',
    eventId: createAdEventId(),
    userId: input.userId,
    sessionId: input.sessionId,
    terminalId: input.terminalId,
    provider: input.provider,
    placement: input.placement,
    advertiser: input.advertiser ?? 'Unknown advertiser',
    creativeId: input.creativeId,
    trust: input.trust,
    creditUsd:
      Math.floor(renderedMs / FIVE_SECOND_AD_RENDERED_MS) *
      FIVE_SECOND_AD_CREDIT_USD,
    renderedMs,
    at: input.at ?? new Date().toISOString(),
  };
}

export function buildAdClickEvent(input: AdClickEventInput): AdClickEvent {
  return {
    kind: 'ad.click',
    client: 'Kickbacks.ai',
    eventId: createAdEventId(),
    userId: input.userId,
    sessionId: input.sessionId,
    terminalId: input.terminalId,
    provider: input.provider,
    placement: input.placement,
    advertiser: input.advertiser ?? 'Unknown advertiser',
    creativeId: input.creativeId,
    trust: input.trust,
    creditUsd: AD_CLICK_CREDIT_USD,
    destinationUrl: input.destinationUrl,
    at: input.at ?? new Date().toISOString(),
  };
}

export function isPrivacySafeAdEvent(value: unknown): value is SafeAdEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return !containsUnsafeField(value as Record<string, unknown>);
}

function containsUnsafeField(value: Record<string, unknown>): boolean {
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_FIELDS.has(key)) return true;
    if (
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested) &&
      containsUnsafeField(nested as Record<string, unknown>)
    ) {
      return true;
    }
  }
  return false;
}

function createAdEventId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}
