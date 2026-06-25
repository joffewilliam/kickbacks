import type { EarnableProvider } from './earningSession';

export type ActivityVerificationSource =
  | 'terminal-parser'
  | 'codex-app-server';

export interface StructuredActivityObservation {
  active: boolean;
  provider: EarnableProvider;
  source: ActivityVerificationSource;
  threadId?: string | null;
  turnId?: string | null;
}

export function codexActivityFromAppServerMessage(
  message: unknown,
): StructuredActivityObservation | null {
  if (!isRecord(message) || typeof message.method !== 'string') return null;
  const params = isRecord(message.params) ? message.params : {};
  if (message.method === 'turn/started') {
    return codexObservationFromTurnParams(params, true);
  }
  if (message.method === 'turn/completed') {
    return codexObservationFromTurnParams(params, false);
  }
  if (message.method === 'thread/status/changed') {
    const status = isRecord(params.status) ? params.status : null;
    if (!status || typeof status.type !== 'string') return null;
    if (status.type === 'active') {
      return {
        active: true,
        provider: 'codex',
        source: 'codex-app-server',
        threadId: stringValue(params.threadId),
        turnId: null,
      };
    }
    if (status.type === 'idle' || status.type === 'systemError') {
      return {
        active: false,
        provider: 'codex',
        source: 'codex-app-server',
        threadId: stringValue(params.threadId),
        turnId: null,
      };
    }
  }
  return null;
}

export function codexThreadListHasActiveTurn(result: unknown): boolean {
  if (!isRecord(result) || !Array.isArray(result.data)) return false;
  return result.data.some((thread) => {
    if (!isRecord(thread)) return false;
    const status = isRecord(thread.status) ? thread.status : null;
    return status?.type === 'active';
  });
}

export function codexActivityFromThreadListResult(
  result: unknown,
): StructuredActivityObservation | null {
  if (!isRecord(result) || !Array.isArray(result.data)) return null;
  const activeThread = result.data.find((thread) => {
    if (!isRecord(thread)) return false;
    const status = isRecord(thread.status) ? thread.status : null;
    return status?.type === 'active';
  });
  if (!isRecord(activeThread)) return null;
  return {
    active: true,
    provider: 'codex',
    source: 'codex-app-server',
    threadId: stringValue(activeThread.id),
    turnId: null,
  };
}

function codexObservationFromTurnParams(
  params: Record<string, unknown>,
  active: boolean,
): StructuredActivityObservation {
  const turn = isRecord(params.turn) ? params.turn : {};
  return {
    active,
    provider: 'codex',
    source: 'codex-app-server',
    threadId: stringValue(params.threadId),
    turnId: stringValue(turn.id),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
