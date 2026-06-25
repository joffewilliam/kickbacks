import { randomUUID } from 'node:crypto';
import {
  spawn as spawnProcess,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  type WebContents,
} from 'electron';
import * as pty from '@lydell/node-pty';
import {
  AdsChannels,
  AuthChannels,
  EarningChannels,
  PtyChannels,
  SettingsChannels,
  ShellChannels,
  TerminalSettingsChannels,
  type PtySpawnLaunchError,
  type LoginRequest,
  type LoginResponse,
  type PtyKillRequest,
  type PtyDetachRequest,
  type PtyReplayRequest,
  type PtyReapRequest,
  type PtyLaunchMode,
  type PtyResizeRequest,
  type PtySpawnRequest,
  type PtySpawnResponse,
  type PtyWriteRequest,
  type RecordAdResponse,
  type EarningStatusRequest,
  type EarningStatusResponse,
  type ShellOpenExternalRequest,
  type ShellOpenExternalResponse,
} from '../shared/ipc';
import {
  createEarningActivityTracker,
  earningDebugStatusForTracker,
  payableActivityForSponsor,
  type EarningActivityTracker,
} from '../shared/earningActivity';
import {
  codexActivityFromAppServerMessage,
  codexActivityFromThreadListResult,
} from '../shared/codexAppServerActivity';
import { resolveCodexExecutable } from '../shared/codexExecutable';
import { codexRemoteTerminalArgs } from '../shared/codexTerminalLaunch';
import {
  type AdClickInput,
  type AdImpressionInput,
  type SafeAdEvent,
} from '../shared/privacyTelemetry';
import { createAdCreditLedger } from '../shared/adCreditLedger';
import {
  createPtySessionFinalizer,
  type PtySessionFinalizer,
} from '../shared/ptySessionLifecycle';
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  type UserSettings,
  type UserSettingsInput,
} from '../shared/userSettings';
import { resolveConfiguredShell } from '../shared/shellResolver';
import { findExecutableCommand } from '../shared/executableLookup';
import {
  clampPtyDimension,
  validatePtySpawnRequest,
} from '../shared/validate';
import {
  ptyDataDisposition,
  sessionsToReap,
} from '../shared/ptyPersistence';
import type { TerminalSettings } from '../shared/terminalSettings';
import {
  loadTerminalSettings,
  saveTerminalSettings,
} from './terminalSettingsStore';
import {
  createSessionRecorder,
  type SessionRecorder,
} from './sessionRecorder';


interface PtySession {
  id: string;
  proc: pty.IPty;
  owner: WebContents;
  activity: EarningActivityTracker;
  finalizer: PtySessionFinalizer;
  /** Persistence key (renderer card id), if this session is reattachable. */
  key?: string;
  launchMode: PtyLaunchMode;
  /** The launched command, used to classify a launch-failure exit. */
  command: string;
  /** Wall-clock spawn time, used to detect an immediate launch failure. */
  startedAt: number;
  /** Whether any output was seen (distinguishes a crash from a no-op exit). */
  sawOutput: boolean;
  /** False while detached (renderer unmounted) or mid-replay. */
  attached: boolean;
  /** Headless replay recorder; absent for unkeyed one-off sessions. */
  recorder?: SessionRecorder;
  /** Non-null only while a replay serialize is in flight (buffers live bytes). */
  pendingReplay: string[] | null;
  pendingResize: { cols: number; rows: number } | null;
  resizeTimer: ReturnType<typeof setTimeout> | null;
}

type RejectedAdResponse = Extract<RecordAdResponse, { accepted: false }>;
type TerminalLaunchMode = PtyLaunchMode;

interface TerminalLaunch {
  command: string;
  args: string[];
  cleanup?: () => void;
  env?: NodeJS.ProcessEnv;
  mode: TerminalLaunchMode;
}

const sessions = new Map<string, PtySession>();
/** Index of reattachable sessions by their renderer card id. */
const sessionByKey = new Map<string, PtySession>();
/** In-flight spawns by key, so a near-simultaneous remount (StrictMode) waits
 * for and reattaches to the first spawn instead of starting a second one. */
const pendingSpawnsByKey = new Map<string, Promise<string>>();
const RESIZE_DEBOUNCE_MS = 80;
/** A nonzero exit with no output inside this window is treated as a launch failure. */
const LAUNCH_FAILURE_WINDOW_MS = 1_500;
const adLedger = createAdCreditLedger();
let currentUser: LoginResponse['user'] | undefined;
let mainWindow: BrowserWindow | undefined;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function loadSettings(): Promise<UserSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    return normalizeUserSettings(JSON.parse(raw) as UserSettingsInput);
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

async function saveSettings(input: UserSettingsInput): Promise<UserSettings> {
  const settings = normalizeUserSettings(input);
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

/**
 * Resolve the user's configured shell into a launch descriptor. 'auto' follows
 * the pwsh7 -> pwsh -> powershell -> COMSPEC -> cmd cascade (PowerShell variants
 * get -NoLogo); a named or custom-path choice maps to the matching binary.
 */
function configuredShellLaunch(settings: TerminalSettings): TerminalLaunch {
  const { command, args } = resolveConfiguredShell(settings.defaultShell);
  return { command, args, mode: 'shell' };
}

/** Drop undefined entries so node-pty only sees string env values. */
function compactStringEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const compact: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') compact[key] = value;
  }
  return compact;
}

/** Build node-pty spawn options, honoring the win32 conpty.dll preference. */
function buildSpawnOptions(
  cols: number,
  rows: number,
  launch: TerminalLaunch,
  settings: TerminalSettings,
): pty.IPtyForkOptions & pty.IWindowsPtyForkOptions {
  const options: pty.IPtyForkOptions & pty.IWindowsPtyForkOptions = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: os.homedir(),
    env: compactStringEnv({
      ...process.env,
      ...launch.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      KICKBACKS_TERMINAL: '1',
    }),
  };
  if (process.platform === 'win32' && settings.useConptyDll) {
    options.useConptyDll = true;
  }
  return options;
}

/**
 * Classify a failed spawn: if the command can't be found on PATH it's a
 * binary-not-found (the renderer offers an install hint), otherwise the binary
 * exists but failed to launch.
 */
function spawnLaunchError(command: string, error: unknown): PtySpawnLaunchError {
  const found = findExecutableCommand(command, process.env, process.platform);
  return {
    kind: found ? 'spawn-failed' : 'binary-not-found',
    command,
    message: error instanceof Error ? error.message : String(error),
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Kickbacks',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

function registerAuthIpc(): void {
  ipcMain.handle(
    AuthChannels.login,
    async (_event, req: LoginRequest): Promise<LoginResponse> => {
      const settings = await saveSettings({
        ...(await loadSettings()),
        name: req.name,
        email: req.email,
      });
      currentUser = {
        id: `local-${randomUUID()}`,
        name: settings.name || 'Kickbacks User',
        email: settings.email || 'local@kickbacks.test',
      };
      return { user: currentUser, settings };
    },
  );
}

function registerSettingsIpc(): void {
  ipcMain.handle(SettingsChannels.load, () => loadSettings());
  ipcMain.handle(
    SettingsChannels.save,
    (_event, settings: UserSettingsInput) => saveSettings(settings),
  );
}

/** Forward PTY output to the renderer, buffering during a replay serialize. */
function forwardPtyData(session: PtySession, data: string): void {
  const disposition = ptyDataDisposition({
    attached: session.attached,
    replaying: session.pendingReplay !== null,
  });
  if (disposition === 'buffer') {
    session.pendingReplay?.push(data);
    return;
  }
  if (disposition === 'send' && !session.owner.isDestroyed()) {
    session.owner.send(PtyChannels.data, { id: session.id, data });
  }
  // 'drop': detached with no listener — the recorder already captured it.
}

/** Apply (and clear) a debounced resize immediately. */
function applyPendingResize(session: PtySession): void {
  if (session.resizeTimer !== null) {
    clearTimeout(session.resizeTimer);
    session.resizeTimer = null;
  }
  const pending = session.pendingResize;
  if (!pending) return;
  session.pendingResize = null;
  const cols = clampPtyDimension(pending.cols);
  const rows = clampPtyDimension(pending.rows);
  try {
    session.proc.resize(cols, rows);
    session.recorder?.resize(cols, rows);
  } catch {
    // Process may have exited between schedule and flush; ignore.
  }
}

/** Rebind a surviving session to a new renderer; replay restores its screen. */
function reattachSession(session: PtySession, owner: WebContents): void {
  session.owner = owner;
  session.attached = false; // stays false until replaySession completes
}

/**
 * Replay the recorded screen to the (re)attached renderer, then resume live
 * forwarding. Flushes any pending resize first so the serialized grid matches
 * the renderer's local terminal (the "COOPER artifact" fix).
 */
async function replaySession(session: PtySession): Promise<void> {
  if (!session.recorder) {
    session.attached = true;
    return;
  }
  if (session.pendingReplay !== null) return; // replay already in flight
  applyPendingResize(session);
  session.pendingReplay = [];
  let serialized = '';
  try {
    serialized = await session.recorder.serialize();
  } catch {
    serialized = '';
  }
  const buffered = session.pendingReplay ?? [];
  session.pendingReplay = null;
  session.attached = true;
  if (session.owner.isDestroyed()) return;
  if (serialized) {
    session.owner.send(PtyChannels.data, { id: session.id, data: serialized });
  }
  for (const chunk of buffered) {
    if (!session.owner.isDestroyed()) {
      session.owner.send(PtyChannels.data, { id: session.id, data: chunk });
    }
  }
}

function killSession(session: PtySession): void {
  if (session.resizeTimer !== null) {
    clearTimeout(session.resizeTimer);
    session.resizeTimer = null;
  }
  try {
    session.proc.kill();
  } catch {
    // Already gone.
  }
  session.finalizer.finalize();
}

function safeCreateRecorder(
  cols: number,
  rows: number,
): SessionRecorder | undefined {
  try {
    return createSessionRecorder({ cols, rows });
  } catch {
    return undefined;
  }
}

function registerPtyIpc(): void {
  ipcMain.handle(
    PtyChannels.spawn,
    async (event, req: PtySpawnRequest): Promise<PtySpawnResponse> => {
      const { cols, rows, cardId } = validatePtySpawnRequest(req);

      // Reattach to a surviving session for this card (e.g. StrictMode remount)
      // instead of spawning a second process.
      if (cardId) {
        const existing = sessionByKey.get(cardId);
        if (existing) {
          reattachSession(existing, event.sender);
          return {
            ok: true,
            id: existing.id,
            launchMode: existing.launchMode,
            reattached: true,
          };
        }
        const inFlight = pendingSpawnsByKey.get(cardId);
        if (inFlight) {
          try {
            await inFlight;
          } catch {
            // Fall through to a fresh spawn below.
          }
          const settled = sessionByKey.get(cardId);
          if (settled) {
            reattachSession(settled, event.sender);
            return {
              ok: true,
              id: settled.id,
              launchMode: settled.launchMode,
              reattached: true,
            };
          }
        }
      }

      const terminalSettings = await loadTerminalSettings();
      let resolveSpawn: (id: string) => void = () => {};
      let rejectSpawn: (error: unknown) => void = () => {};
      if (cardId) {
        pendingSpawnsByKey.set(
          cardId,
          new Promise<string>((resolve, reject) => {
            resolveSpawn = resolve;
            rejectSpawn = reject;
          }),
        );
      }
      const clearPending = () => {
        if (cardId) pendingSpawnsByKey.delete(cardId);
      };

      const id = randomUUID();
      const codexActivity = createEarningActivityTracker({
        terminalId: id,
        terminalTextDetection: false,
      });
      const managed = await createManagedCodexLaunch(codexActivity);
      const managedCodex = managed && !isCodexMissing(managed) ? managed : null;
      const fallbackActivity = () =>
        createEarningActivityTracker({
          terminalId: id,
          terminalTextDetection: true,
        });
      let fallbackReason: string | undefined;
      if (managedCodex) {
        fallbackReason = undefined;
      } else if (managed && isCodexMissing(managed)) {
        // Codex CLI is absent: keep the terminal usable via the shell, but tell
        // the user how to enable earning.
        fallbackReason =
          'Codex CLI not found on PATH; opened your shell. Install @openai/codex (or set CODEX_CLI_PATH) to earn.';
      } else {
        fallbackReason = 'Kickbacks server unavailable; opened shell fallback.';
      }
      let activity = managedCodex ? codexActivity : fallbackActivity();
      let launch = managedCodex ?? configuredShellLaunch(terminalSettings);
      let command = launch.command;
      let args = launch.args;
      let proc: pty.IPty;
      try {
        proc = pty.spawn(
          command,
          args,
          buildSpawnOptions(cols, rows, launch, terminalSettings),
        );
      } catch (error) {
        launch.cleanup?.();
        if (launch.mode === 'codex-app-server') {
          launch = configuredShellLaunch(terminalSettings);
          activity = fallbackActivity();
          fallbackReason =
            'Managed Codex terminal failed; opened shell fallback.';
          command = launch.command;
          args = launch.args;
          try {
            proc = pty.spawn(
              command,
              args,
              buildSpawnOptions(cols, rows, launch, terminalSettings),
            );
          } catch (shellError) {
            rejectSpawn(shellError);
            clearPending();
            return { ok: false, error: spawnLaunchError(command, shellError) };
          }
        } else {
          rejectSpawn(error);
          clearPending();
          return { ok: false, error: spawnLaunchError(command, error) };
        }
      }

      const session: PtySession = {
        id,
        proc,
        owner: event.sender,
        activity,
        finalizer: undefined as unknown as PtySessionFinalizer,
        key: cardId,
        launchMode: launch.mode,
        command,
        startedAt: Date.now(),
        sawOutput: false,
        attached: true,
        recorder: cardId ? safeCreateRecorder(cols, rows) : undefined,
        pendingReplay: null,
        pendingResize: null,
        resizeTimer: null,
      };
      const launchCleanup = launch.cleanup;
      session.finalizer = createPtySessionFinalizer({
        cleanup: () => {
          if (session.resizeTimer !== null) clearTimeout(session.resizeTimer);
          session.recorder?.dispose();
          launchCleanup?.();
          if (session.key && sessionByKey.get(session.key) === session) {
            sessionByKey.delete(session.key);
          }
        },
        remove: () => sessions.delete(id),
      });
      sessions.set(id, session);
      if (cardId) sessionByKey.set(cardId, session);

      proc.onData((data) => {
        session.sawOutput = true;
        session.activity.noteOutput(data);
        try {
          session.recorder?.feed(data);
        } catch {
          // Recorder degraded to no-replay; live forwarding still works.
        }
        forwardPtyData(session, data);
      });

      proc.onExit(({ exitCode, signal }) => {
        // A nonzero, output-free exit right after spawn means the binary failed
        // to launch (on Windows ConPTY this surfaces here, not as a throw).
        const launchFailed =
          !session.sawOutput &&
          exitCode !== 0 &&
          Date.now() - session.startedAt < LAUNCH_FAILURE_WINDOW_MS;
        session.finalizer.finalize();
        if (session.owner.isDestroyed()) return;
        if (launchFailed) {
          session.owner.send(PtyChannels.launchFailed, {
            id,
            error: spawnLaunchError(
              session.command,
              new Error(
                `Process exited with code ${exitCode} before producing output`,
              ),
            ),
          });
        }
        session.owner.send(PtyChannels.exit, { id, exitCode, signal });
      });

      resolveSpawn(id);
      clearPending();
      return {
        ok: true,
        fallbackReason,
        id,
        launchMode: launch.mode,
        reattached: false,
      };
    },
  );

  ipcMain.on(PtyChannels.write, (event, req: PtyWriteRequest) => {
    const session = sessions.get(req.id);
    if (!session || session.owner !== event.sender) return;
    session.activity.noteInput(req.data);
    session.proc.write(req.data);
  });

  ipcMain.on(PtyChannels.resize, (event, req: PtyResizeRequest) => {
    const session = sessions.get(req.id);
    if (!session || session.owner !== event.sender) return;
    session.pendingResize = { cols: req.cols, rows: req.rows };
    if (session.resizeTimer !== null) clearTimeout(session.resizeTimer);
    session.resizeTimer = setTimeout(
      () => applyPendingResize(session),
      RESIZE_DEBOUNCE_MS,
    );
  });

  ipcMain.on(PtyChannels.kill, (event, req: PtyKillRequest) => {
    const session = sessions.get(req.id);
    if (!session || session.owner !== event.sender) return;
    killSession(session);
  });

  ipcMain.on(PtyChannels.detach, (event, req: PtyDetachRequest) => {
    const session = sessions.get(req.id);
    if (!session || session.owner !== event.sender) return;
    applyPendingResize(session);
    session.attached = false;
    session.pendingReplay = null;
  });

  ipcMain.on(PtyChannels.replay, (event, req: PtyReplayRequest) => {
    const session = sessions.get(req.id);
    if (!session || session.owner !== event.sender) return;
    void replaySession(session);
  });

  ipcMain.on(PtyChannels.reap, (event, req: PtyReapRequest) => {
    const owned = [...sessions.values()].filter(
      (session) => session.owner === event.sender,
    );
    for (const id of sessionsToReap(owned, req.cardIds ?? [])) {
      const session = sessions.get(id);
      if (session) killSession(session);
    }
  });
}

interface CodexMissing {
  codexMissing: true;
  command: string;
}

function isCodexMissing(
  value: TerminalLaunch | CodexMissing | null,
): value is CodexMissing {
  return value !== null && 'codexMissing' in value;
}

async function createManagedCodexLaunch(
  activity: EarningActivityTracker,
): Promise<TerminalLaunch | CodexMissing | null> {
  let appServer: ChildProcessWithoutNullStreams | null = null;
  try {
    const codexCommand = resolveCodexExecutable({
      env: process.env,
      exists: existsSync,
      platform: process.platform,
    });
    // Distinguish a missing CLI from a server/handshake failure: only the
    // former should steer the user toward installing Codex.
    if (
      findExecutableCommand(codexCommand, process.env, process.platform) ===
      undefined
    ) {
      return { codexMissing: true, command: codexCommand };
    }
    const port = await getFreeLoopbackPort();
    const endpoint = `ws://127.0.0.1:${port}`;
    appServer = spawnProcess(
      codexCommand,
      ['app-server', '--listen', endpoint],
      {
        cwd: os.homedir(),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    appServer.stdout.on('data', () => undefined);
    appServer.stderr.on('data', () => undefined);

    appServer.on('exit', () => {
      activity.noteStructuredActivity({
        active: false,
        provider: 'codex',
        source: 'codex-app-server',
      });
    });

    await waitForCodexAppServerReady(port, appServer);
    const monitor = createCodexAppServerMonitor({
      activity,
      endpoint,
      version: app.getVersion(),
      cwd: os.homedir(),
    });
    const cleanup = () => {
      monitor.dispose();
      if (appServer && !appServer.killed) {
        appServer.kill();
      }
    };

    return {
      command: codexCommand,
      args: codexRemoteTerminalArgs(endpoint),
      cleanup,
      mode: 'codex-app-server',
    };
  } catch {
    if (appServer && !appServer.killed) {
      appServer.kill();
    }
    return null;
  }
}

interface CodexMonitorInput {
  activity: EarningActivityTracker;
  cwd: string;
  endpoint: string;
  version: string;
}

function createCodexAppServerMonitor({
  activity,
  cwd,
  endpoint,
  version,
}: CodexMonitorInput): { dispose: () => void } {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    activity.noteStructuredActivity({
      active: false,
      provider: 'codex',
      source: 'codex-app-server',
    });
    return { dispose: () => undefined };
  }

  let disposed = false;
  let nextRequestId = 1;
  const pendingRequests = new Map<number, 'thread/list'>();
  const socket = new WebSocketCtor(endpoint);

  const send = (message: unknown) => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  };

  const pollThreads = () => {
    const id = nextRequestId++;
    pendingRequests.set(id, 'thread/list');
    send({
      method: 'thread/list',
      id,
      params: {
        archived: false,
        cwd,
        limit: 12,
        sourceKinds: ['cli', 'appServer'],
        useStateDbOnly: true,
      },
    });
  };

  const pollInterval = setInterval(pollThreads, 1_500);

  socket.addEventListener('open', () => {
    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'kickbacks_desktop',
          title: 'Kickbacks.ai Desktop',
          version,
        },
        capabilities: {
          experimentalApi: true,
        },
      },
    });
    send({ method: 'initialized', params: {} });
    pollThreads();
  });

  socket.addEventListener('message', (event) => {
    const message = parseJsonMessage(event.data);
    if (!message) return;
    const structured = codexActivityFromAppServerMessage(message);
    if (structured) {
      activity.noteStructuredActivity(structured);
      return;
    }
    if (!isRecord(message) || typeof message.id !== 'number') return;
    const request = pendingRequests.get(message.id);
    if (!request) return;
    pendingRequests.delete(message.id);
    if (request === 'thread/list') {
      const structured = codexActivityFromThreadListResult(message.result);
      if (structured) activity.noteStructuredActivity(structured);
    }
  });

  const markIdle = () => {
    if (disposed) return;
    activity.noteStructuredActivity({
      active: false,
      provider: 'codex',
      source: 'codex-app-server',
    });
  };
  socket.addEventListener('close', markIdle);
  socket.addEventListener('error', markIdle);

  return {
    dispose() {
      disposed = true;
      clearInterval(pollInterval);
      if (socket.readyState === 0 || socket.readyState === 1) {
        socket.close();
      }
    },
  };
}

function parseJsonMessage(value: unknown): unknown | null {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function waitForCodexAppServerReady(
  port: number,
  proc: ChildProcessWithoutNullStreams,
): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error('Kickbacks server exited before ready.');
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`);
      if (response.ok) return;
    } catch {
      // Wait for the listener to come up.
    }
    await delay(150);
  }
  throw new Error('Timed out waiting for Kickbacks server.');
}

async function getFreeLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to reserve port.')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerAdsIpc(): void {
  ipcMain.handle(
    AdsChannels.impression,
    (event, req: AdImpressionInput): RecordAdResponse => {
      return retainSafeAdImpression(req, event.sender);
    },
  );
  ipcMain.handle(AdsChannels.click, (event, req: AdClickInput): RecordAdResponse => {
    return retainSafeAdClick(req, event.sender);
  });
  ipcMain.handle(AdsChannels.list, (): SafeAdEvent[] => adLedger.list());
}

function registerEarningIpc(): void {
  ipcMain.handle(
    EarningChannels.status,
    (_event, req: EarningStatusRequest): EarningStatusResponse => {
      const session = sessions.get(req.terminalId);
      if (!session) {
        return {
          found: false,
          terminalId: req.terminalId,
          checkedAt: Date.now(),
          payable: false,
          reason: 'terminal-not-found',
          label: 'Terminal session not found',
          detectedProvider: null,
          structuredActivityActive: null,
          verificationSource: null,
          currentThinkingDurationMs: null,
          lastThinkingDurationMs: null,
          inputBytes: 0,
          outputBytes: 0,
          lastInputAgeMs: null,
          lastOutputAgeMs: null,
          lastThinkingAgeMs: null,
        };
      }
      return {
        found: true,
        ...earningDebugStatusForTracker({
          now: Date.now(),
          tracker: session.activity,
        }),
      };
    },
  );
}

function retainSafeAdImpression(
  req: AdImpressionInput,
  sender: WebContents,
): RecordAdResponse {
  const provider = detectedPayableProvider(req, sender);
  if (!provider.accepted) return provider;
  return adLedger.retainImpression({
    input: req,
    now: Date.now(),
    provider: provider.provider,
  });
}

function retainSafeAdClick(req: AdClickInput, sender: WebContents): RecordAdResponse {
  const provider = detectedPayableProvider(req, sender);
  if (!provider.accepted) return provider;
  return adLedger.retainClick({
    input: req,
    provider: provider.provider,
  });
}

function detectedPayableProvider(
  req: AdImpressionInput | AdClickInput,
  sender: WebContents,
):
  | { accepted: true; provider: SafeAdEvent['provider'] }
  | RejectedAdResponse {
  if (!currentUser) {
    return adLedger.rejected('signed-out', 'Sign in to earn');
  }
  if (req.userId !== currentUser.id) {
    return adLedger.rejected(
      'user-mismatch',
      'User does not match signed-in account',
    );
  }
  const session = sessions.get(req.terminalId);
  if (!session || session.owner !== sender) {
    return adLedger.rejected('terminal-not-found', 'Terminal session not found');
  }
  const activity = payableActivityForSponsor({
    now: Date.now(),
    tracker: session.activity,
  });
  if (!activity.payable) {
    return adLedger.rejected(activity.reason, activity.label);
  }
  return { accepted: true, provider: activity.provider };
}

function registerShellIpc(): void {
  ipcMain.handle(
    ShellChannels.openExternal,
    async (_event, req: ShellOpenExternalRequest): Promise<ShellOpenExternalResponse> => {
      try {
        const url = new URL(req.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          return { ok: false };
        }
        await shell.openExternal(url.toString());
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  );
}

function registerTerminalSettingsIpc(): void {
  ipcMain.handle(TerminalSettingsChannels.load, () => loadTerminalSettings());
  ipcMain.handle(
    TerminalSettingsChannels.save,
    (_event, settings: unknown) => saveTerminalSettings(settings),
  );
}

function killAllSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.proc.kill();
    } catch {
      // Best effort during shutdown.
    }
    session.finalizer.finalize();
  }
}

app.setName('Kickbacks');

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAuthIpc();
  registerSettingsIpc();
  registerPtyIpc();
  registerAdsIpc();
  registerEarningIpc();
  registerShellIpc();
  registerTerminalSettingsIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killAllSessions();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killAllSessions);
