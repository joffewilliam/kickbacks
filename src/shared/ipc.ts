import type { EarningState, ProviderSelection } from './earningSession';
import type {
  AdClickInput,
  AdImpressionInput,
  SafeAdEvent,
} from './privacyTelemetry';
import type { UserSettings, UserSettingsInput } from './userSettings';
import type { TerminalSettings } from './terminalSettings';
import type {
  EarningDetectorDebugStatus,
  PayableActivityReason,
} from './earningActivity';

export const AuthChannels = {
  login: 'auth:login',
} as const;

export const SettingsChannels = {
  load: 'settings:load',
  save: 'settings:save',
} as const;

export const PtyChannels = {
  spawn: 'pty:spawn',
  write: 'pty:write',
  resize: 'pty:resize',
  kill: 'pty:kill',
  detach: 'pty:detach',
  replay: 'pty:replay',
  reap: 'pty:reap',
  data: 'pty:data',
  exit: 'pty:exit',
  launchFailed: 'pty:launch-failed',
} as const;

export const AdsChannels = {
  impression: 'ads:impression',
  click: 'ads:click',
  list: 'ads:list',
} as const;

export const EarningChannels = {
  status: 'earning:status',
} as const;

export const ShellChannels = {
  openExternal: 'shell:open-external',
} as const;

export const TerminalSettingsChannels = {
  load: 'terminal-settings:load',
  save: 'terminal-settings:save',
} as const;

export interface KickbacksUser {
  id: string;
  name: string;
  email: string;
}

export interface LoginRequest {
  name: string;
  email: string;
}

export interface LoginResponse {
  user: KickbacksUser;
  settings: UserSettings;
}

export interface PtySpawnRequest {
  cols: number;
  rows: number;
  /** Stable card id used to persist & reattach the session across remounts. */
  cardId?: string;
}

export type PtyLaunchMode = 'shell' | 'codex-app-server';

export interface PtySpawnLaunchError {
  kind: 'binary-not-found' | 'spawn-failed' | 'spawn-ipc-failed';
  command: string;
  message?: string;
}

export type PtySpawnResponse =
  | {
      ok: true;
      fallbackReason?: string;
      id: string;
      launchMode: PtyLaunchMode;
      /** True when this reattached to a surviving session; renderer replays. */
      reattached?: boolean;
    }
  | {
      ok: false;
      error: PtySpawnLaunchError;
    };

export interface PtyWriteRequest {
  id: string;
  data: string;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyKillRequest {
  id: string;
}

export interface PtyDetachRequest {
  id: string;
}

export interface PtyReplayRequest {
  id: string;
}

export interface PtyReapRequest {
  cardIds: string[];
}

export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

export interface PtyLaunchFailedEvent {
  id: string;
  error: PtySpawnLaunchError;
}

export interface ShellOpenExternalRequest {
  url: string;
}

export interface ShellOpenExternalResponse {
  ok: boolean;
}

export type RecordAdRejectedReason =
  | Exclude<PayableActivityReason, 'active'>
  | 'signed-out'
  | 'user-mismatch'
  | 'terminal-not-found'
  | 'ad-duration-too-short'
  | 'hourly-ad-limit'
  | 'duplicate-click';

export type RecordAdResponse =
  | {
      accepted: true;
      event: SafeAdEvent;
      retainedEvents: number;
    }
  | {
      accepted: false;
      reason: RecordAdRejectedReason;
      label: string;
      retainedEvents: number;
    };

export interface EarningStatusRequest {
  terminalId: string;
}

export type EarningStatusResponse =
  | ({
      found: true;
    } & EarningDetectorDebugStatus)
  | {
      found: false;
      terminalId: string;
      checkedAt: number;
      payable: false;
      reason: 'terminal-not-found';
      label: string;
      detectedProvider: null;
      structuredActivityActive: null;
      verificationSource: null;
      currentThinkingDurationMs: null;
      lastThinkingDurationMs: null;
      inputBytes: 0;
      outputBytes: 0;
      lastInputAgeMs: null;
      lastOutputAgeMs: null;
      lastThinkingAgeMs: null;
    };

export interface KickbacksApi {
  login(req: LoginRequest): Promise<LoginResponse>;
  loadSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettingsInput): Promise<UserSettings>;
  spawnTerminal(req: PtySpawnRequest): Promise<PtySpawnResponse>;
  writeTerminal(req: PtyWriteRequest): void;
  resizeTerminal(req: PtyResizeRequest): void;
  killTerminal(req: PtyKillRequest): void;
  detachTerminal(req: PtyDetachRequest): void;
  replayTerminal(req: PtyReplayRequest): void;
  reapTerminals(req: PtyReapRequest): void;
  onTerminalData(listener: (event: PtyDataEvent) => void): () => void;
  onTerminalExit(listener: (event: PtyExitEvent) => void): () => void;
  onTerminalLaunchFailed(
    listener: (event: PtyLaunchFailedEvent) => void,
  ): () => void;
  recordAdImpression(req: AdImpressionInput): Promise<RecordAdResponse>;
  recordAdClick(req: AdClickInput): Promise<RecordAdResponse>;
  listAdEvents(): Promise<SafeAdEvent[]>;
  earningStatus(req: EarningStatusRequest): Promise<EarningStatusResponse>;
  openExternal(req: ShellOpenExternalRequest): Promise<ShellOpenExternalResponse>;
  loadTerminalSettings(): Promise<TerminalSettings>;
  saveTerminalSettings(settings: TerminalSettings): Promise<TerminalSettings>;
}

export interface RendererEarningSummary {
  provider: ProviderSelection;
  state: EarningState;
}
