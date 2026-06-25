export interface AutomaticSponsorAdInput {
  activeTerminalId: string | null;
  eligible: boolean;
  lastServedAt: number | null;
  now: number;
  payable: boolean;
  minIntervalMs?: number;
}

export interface AutomaticSponsorAdPollInput extends AutomaticSponsorAdInput {
}

export interface AutomaticSponsorAdPollState {
  lastServedAt: number | null;
  serve: boolean;
}

export const DEFAULT_AUTOMATIC_SPONSOR_AD_INTERVAL_MS = 30_000;

export function shouldServeAutomaticSponsorAd({
  activeTerminalId,
  eligible,
  lastServedAt,
  minIntervalMs = DEFAULT_AUTOMATIC_SPONSOR_AD_INTERVAL_MS,
  now,
  payable,
}: AutomaticSponsorAdInput): boolean {
  if (!eligible || !activeTerminalId || !payable) return false;
  return lastServedAt === null || now - lastServedAt >= minIntervalMs;
}

export function nextAutomaticSponsorAdPollState({
  activeTerminalId,
  eligible,
  lastServedAt,
  minIntervalMs,
  now,
  payable,
}: AutomaticSponsorAdPollInput): AutomaticSponsorAdPollState {
  if (!payable) {
    return {
      lastServedAt: null,
      serve: false,
    };
  }

  const serve = shouldServeAutomaticSponsorAd({
    activeTerminalId,
    eligible,
    lastServedAt,
    minIntervalMs,
    now,
    payable,
  });

  return {
    lastServedAt: serve ? now : lastServedAt,
    serve,
  };
}
