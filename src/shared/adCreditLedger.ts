import type { ProviderSelection } from './earningSession';
import type {
  RecordAdRejectedReason,
  RecordAdResponse,
} from './ipc';
import {
  FIVE_SECOND_AD_RENDERED_MS,
  buildAdClickEvent,
  buildAdImpressionEvent,
  isPrivacySafeAdEvent,
  type AdClickInput,
  type AdImpressionInput,
  type SafeAdEvent,
} from './privacyTelemetry';

export const FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR = 120;
export const AD_CREDIT_WINDOW_MS = 60 * 60 * 1_000;
export const AD_CLICK_DEDUPE_WINDOW_MS = 5_000;
export const MAX_RETAINED_AD_EVENTS = 500;

type RejectedAdResponse = Extract<RecordAdResponse, { accepted: false }>;

export interface RetainImpressionInput {
  input: AdImpressionInput;
  now: number;
  provider: ProviderSelection;
}

export interface RetainClickInput {
  input: AdClickInput;
  provider: ProviderSelection;
}

export interface AdCreditLedger {
  list(): SafeAdEvent[];
  retainClick(input: RetainClickInput): RecordAdResponse;
  retainEvent(event: unknown): RecordAdResponse;
  retainImpression(input: RetainImpressionInput): RecordAdResponse;
  rejected(reason: RecordAdRejectedReason, label: string): RejectedAdResponse;
}

export function createAdCreditLedger(
  initialEvents: SafeAdEvent[] = [],
): AdCreditLedger {
  const adLedger = [...initialEvents];

  function retainEvent(event: unknown): RecordAdResponse {
    if (!isPrivacySafeAdEvent(event)) {
      throw new Error('Unsafe ad event rejected before retention.');
    }
    adLedger.push(event);
    while (adLedger.length > MAX_RETAINED_AD_EVENTS) {
      adLedger.shift();
    }
    return {
      accepted: true,
      event,
      retainedEvents: adLedger.length,
    };
  }

  function rejected(
    reason: RecordAdRejectedReason,
    label: string,
  ): RejectedAdResponse {
    return {
      accepted: false,
      label,
      reason,
      retainedEvents: adLedger.length,
    };
  }

  function withinFiveSecondAdHourlyLimit(userId: string, now: number): boolean {
    const windowStart = now - AD_CREDIT_WINDOW_MS;
    const creditedFiveSecondAds = adLedger.filter((event) => {
      if (event.kind !== 'ad.impression') return false;
      if (event.userId !== userId) return false;
      if (event.renderedMs < FIVE_SECOND_AD_RENDERED_MS) return false;
      return Date.parse(event.at) >= windowStart;
    });
    return creditedFiveSecondAds.length < FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR;
  }

  return {
    list() {
      return [...adLedger];
    },
    retainClick({ input, provider }) {
      if (!withinClickDedupeWindow(input)) {
        return rejected('duplicate-click', 'Sponsor click already credited');
      }
      return retainEvent(buildAdClickEvent({ ...input, provider }));
    },
    retainEvent,
    retainImpression({ input, now, provider }) {
      if (input.renderedMs < FIVE_SECOND_AD_RENDERED_MS) {
        return rejected(
          'ad-duration-too-short',
          'Ad display was under 5 seconds',
        );
      }
      if (!withinFiveSecondAdHourlyLimit(input.userId, now)) {
        return rejected(
          'hourly-ad-limit',
          'Hourly 5 second ad credit limit reached',
        );
      }
      return retainEvent(buildAdImpressionEvent({ ...input, provider }));
    },
    rejected,
  };

  function withinClickDedupeWindow(input: AdClickInput): boolean {
    const clickedAt = parseEventTime(input.at);
    return !adLedger.some((event) => {
      if (event.kind !== 'ad.click') return false;
      if (event.userId !== input.userId) return false;
      if (event.sessionId !== input.sessionId) return false;
      if (event.terminalId !== input.terminalId) return false;
      if (event.placement !== input.placement) return false;
      if (event.creativeId !== input.creativeId) return false;
      if (event.destinationUrl !== input.destinationUrl) return false;
      return clickedAt - Date.parse(event.at) < AD_CLICK_DEDUPE_WINDOW_MS;
    });
  }
}

function parseEventTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Date.now();
  return Number.isFinite(parsed) ? parsed : Date.now();
}
