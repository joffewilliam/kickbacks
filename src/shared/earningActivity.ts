import type { EarnableProvider } from './earningSession';
import type {
  ActivityVerificationSource,
  StructuredActivityObservation,
} from './codexAppServerActivity';

export type PayableActivityReason =
  | 'active'
  | 'model-not-detected'
  | 'thinking-line-not-detected'
  | 'idle-terminal';

export type PayableActivityResult =
  | {
      payable: true;
      reason: 'active';
      label: string;
      provider: EarnableProvider;
    }
  | {
      payable: false;
      reason: Exclude<PayableActivityReason, 'active'>;
      label: string;
    };

export interface EarningActivitySnapshot {
  terminalId: string;
  inputBytes: number;
  outputBytes: number;
  detectedProvider: EarnableProvider | null;
  structuredActivityActive: boolean | null;
  verificationSource: ActivityVerificationSource | null;
  currentThinkingStartedAt: number | null;
  lastThinkingDurationMs: number | null;
  lastInputAt: number | null;
  lastOutputAt: number | null;
  lastThinkingAt: number | null;
}

export interface EarningActivityTracker {
  noteInput(data: string): void;
  noteOutput(data: string): void;
  noteStructuredActivity(observation: StructuredActivityObservation): void;
  snapshot(): EarningActivitySnapshot;
}

export interface EarningActivityTrackerOptions {
  terminalId: string;
  now?: () => number;
  terminalTextDetection?: boolean;
}

export interface EarningDetectorDebugStatus {
  terminalId: string;
  checkedAt: number;
  payable: boolean;
  reason: PayableActivityReason;
  label: string;
  detectedProvider: EarnableProvider | null;
  structuredActivityActive: boolean | null;
  verificationSource: ActivityVerificationSource | null;
  currentThinkingDurationMs: number | null;
  lastThinkingDurationMs: number | null;
  inputBytes: number;
  outputBytes: number;
  lastInputAgeMs: number | null;
  lastOutputAgeMs: number | null;
  lastThinkingAgeMs: number | null;
}

export interface PayableActivityInput {
  tracker: EarningActivityTracker;
  now: number;
  thinkingWindowMs?: number;
}

export const DEFAULT_THINKING_ACTIVITY_WINDOW_MS = 15_000;

export function createEarningActivityTracker({
  terminalId,
  now = Date.now,
  terminalTextDetection = true,
}: EarningActivityTrackerOptions): EarningActivityTracker {
  let inputBytes = 0;
  let outputBytes = 0;
  let detectedProvider: EarnableProvider | null = null;
  let structuredActivityActive: boolean | null = null;
  let verificationSource: ActivityVerificationSource | null = null;
  let currentThinkingStartedAt: number | null = null;
  let lastThinkingDurationMs: number | null = null;
  let lastInputAt: number | null = null;
  let lastOutputAt: number | null = null;
  let lastThinkingAt: number | null = null;
  let statusParserTail = '';

  function observe(data: string, source: 'input' | 'output') {
    if (!terminalTextDetection) return;
    const text = normalizeTerminalText(data);
    const parserText =
      source === 'output'
        ? normalizeTerminalText(`${statusParserTail}${text}`)
        : text;
    const observedProvider = detectProvider(parserText);
    if (observedProvider) detectedProvider = observedProvider;
    if (
      source === 'output' &&
      isThinkingStatusLine(parserText, detectedProvider)
    ) {
      verificationSource = 'terminal-parser';
      structuredActivityActive = null;
      lastThinkingAt = now();
    }
    statusParserTail =
      source === 'output' && shouldKeepStatusTail(text, parserText)
        ? parserText.slice(-160)
        : '';
  }

  return {
    noteInput(data: string) {
      inputBytes += Buffer.byteLength(data);
      lastInputAt = now();
      observe(data, 'input');
    },
    noteOutput(data: string) {
      outputBytes += Buffer.byteLength(data);
      lastOutputAt = now();
      observe(data, 'output');
    },
    noteStructuredActivity(observation: StructuredActivityObservation) {
      detectedProvider = observation.provider;
      verificationSource = observation.source;
      structuredActivityActive = observation.active;
      const observedAt = now();
      if (observation.active) {
        if (currentThinkingStartedAt === null) {
          currentThinkingStartedAt = observedAt;
        }
        lastThinkingAt = observedAt;
      } else if (currentThinkingStartedAt !== null) {
        lastThinkingDurationMs = Math.max(0, observedAt - currentThinkingStartedAt);
        currentThinkingStartedAt = null;
      }
    },
    snapshot() {
      return {
        terminalId,
        inputBytes,
        outputBytes,
        detectedProvider,
        structuredActivityActive,
        verificationSource,
        currentThinkingStartedAt,
        lastThinkingDurationMs,
        lastInputAt,
        lastOutputAt,
        lastThinkingAt,
      };
    },
  };
}

export function payableActivityForSponsor({
  tracker,
  now,
  thinkingWindowMs = DEFAULT_THINKING_ACTIVITY_WINDOW_MS,
}: PayableActivityInput): PayableActivityResult {
  const snapshot = tracker.snapshot();
  if (!snapshot.detectedProvider) {
    return {
      payable: false,
      reason: 'model-not-detected',
      label: 'Waiting for model activity',
    };
  }

  if (snapshot.structuredActivityActive === false) {
    return {
      payable: false,
      reason: 'idle-terminal',
      label: 'Model is no longer thinking',
    };
  }

  if (snapshot.structuredActivityActive === true) {
    return {
      payable: true,
      reason: 'active',
      label: `${providerLabel(snapshot.detectedProvider)} thinking verified`,
      provider: snapshot.detectedProvider,
    };
  }

  if (snapshot.lastThinkingAt === null) {
    return {
      payable: false,
      reason: 'thinking-line-not-detected',
      label: 'Waiting for thinking line',
    };
  }

  if (now - snapshot.lastThinkingAt > thinkingWindowMs) {
    return {
      payable: false,
      reason: 'idle-terminal',
      label: 'Model is no longer thinking',
    };
  }

  return {
    payable: true,
    reason: 'active',
    label: `${providerLabel(snapshot.detectedProvider)} thinking verified`,
    provider: snapshot.detectedProvider,
  };
}

export function earningDebugStatusForTracker({
  tracker,
  now,
  thinkingWindowMs,
}: PayableActivityInput): EarningDetectorDebugStatus {
  const snapshot = tracker.snapshot();
  const payable = payableActivityForSponsor({
    now,
    thinkingWindowMs,
    tracker,
  });
  return {
    terminalId: snapshot.terminalId,
    checkedAt: now,
    payable: payable.payable,
    reason: payable.reason,
    label: payable.label,
    detectedProvider: snapshot.detectedProvider,
    structuredActivityActive: snapshot.structuredActivityActive,
    verificationSource: snapshot.verificationSource,
    currentThinkingDurationMs: ageMs(now, snapshot.currentThinkingStartedAt),
    lastThinkingDurationMs: snapshot.lastThinkingDurationMs,
    inputBytes: snapshot.inputBytes,
    outputBytes: snapshot.outputBytes,
    lastInputAgeMs: ageMs(now, snapshot.lastInputAt),
    lastOutputAgeMs: ageMs(now, snapshot.lastOutputAt),
    lastThinkingAgeMs: ageMs(now, snapshot.lastThinkingAt),
  };
}

function detectProvider(data: string): EarnableProvider | null {
  const text = normalizeTerminalText(data);
  if (/\bclaude(\s+code)?\b/i.test(text) || /\u273b\s*Thinking/i.test(text)) {
    return 'claude';
  }
  if (
    /\bcodex\b/i.test(text) ||
    /\bgpt-\d/i.test(text) ||
    /[\u2022\u25cf]\s*Working\s*\(\d+s\b/i.test(text)
  ) {
    return 'codex';
  }
  if (/\bcursor\b/i.test(text)) {
    return 'cursor';
  }
  return null;
}

function isThinkingStatusLine(
  data: string,
  provider: EarnableProvider | null,
): boolean {
  const text = normalizeTerminalText(data);
  if (!provider) return false;
  if (provider === 'codex') {
    return /[\u2022\u25cf]\s*Working\s*\(\d+s\b/i.test(text);
  }
  if (provider === 'claude') {
    return (
      /(?:^|\s)(?:\u273b|\u2722|\u2736|\u25cf|\u23fa)\s*(?:Thinking|Combobulating|Pondering)\b/i.test(
        text,
      ) || /(?:^|\s)(?:Thinking|Combobulating|Pondering)[.\u2026]+$/i.test(text)
    );
  }
  return /\b(?:Cursor|Agent)\b.{0,80}\b(?:thinking|working|processing)\b/i.test(
    text,
  );
}

function shouldKeepStatusTail(text: string, parserText: string): boolean {
  if (!text) return false;
  if (isLikelyStatusFragment(text)) return true;
  return Boolean(statusLikePrefix(parserText));
}

function isLikelyStatusFragment(text: string): boolean {
  return (
    /[\u2022\u25cf]\s*(?:W|Wo|Wor|Work|Worki|Workin|Working)?$/i.test(text) ||
    /\bWorking\s*\(\d*s?$/i.test(text) ||
    /\besc\s+to\s+interrupt\b/i.test(text) ||
    /(?:\u273b|\u2722|\u2736|\u25cf|\u23fa)\s*(?:T|Th|Thi|Think|Thinking)?$/i.test(
      text,
    )
  );
}

function statusLikePrefix(text: string): RegExpMatchArray | null {
  return text.match(
    /(?:[\u2022\u25cf]\s*Work|\bWorking\s*\(\d+s|(?:\u273b|\u2722|\u2736|\u25cf|\u23fa)\s*Think)/i,
  );
}

function normalizeTerminalText(data: string): string {
  return data
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function providerLabel(provider: EarnableProvider): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  return 'Cursor';
}

function ageMs(now: number, at: number | null): number | null {
  return at === null ? null : Math.max(0, now - at);
}
