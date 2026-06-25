import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import { Terminal as XTerm } from '@xterm/xterm';
import {
  Apple,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LogIn,
  Mail,
  Maximize2,
  Play,
  Save,
  Settings,
  ShieldCheck,
  SquareTerminal,
  User,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { earningStateForSession } from '../shared/earningSession';
import { FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR } from '../shared/adCreditLedger';
import type {
  EarningStatusResponse,
  KickbacksApi,
  KickbacksUser,
  PtyLaunchMode,
  PtySpawnLaunchError,
  PtySpawnResponse,
} from '../shared/ipc';
import type { SafeAdEvent } from '../shared/privacyTelemetry';
import { FIVE_SECOND_AD_RENDERED_MS } from '../shared/privacyTelemetry';
import {
  sessionProofState,
  type SessionProofState,
} from '../shared/sessionProofState';
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  type UserSettings,
} from '../shared/userSettings';
import {
  DEFAULT_TERMINAL_SETTINGS,
  terminalSettingsFromJson,
  type TerminalSettings,
  type TerminalShellChoice,
} from '../shared/terminalSettings';
import {
  defaultKickbacksDeck,
  settingsSections,
  type KickbacksCard,
  type KickbacksDeck,
  type KickbacksRect,
  type SettingsSectionId,
} from '../shared/workspaceModel';
import { nextAutomaticSponsorAdPollState } from '../shared/sponsorAutomation';
import { attachTerminalBoardPointerFix } from './terminalBoardPointer';
import {
  createLocalTrustSignalMonitor,
  type TrustDebugSnapshot,
} from './trustSignalMonitor';
import {
  DEFAULT_TERMINAL_CARD_ID,
  defaultTerminalLaunchModes,
  defaultTerminalSessions,
  nextLiveTerminalCardId,
  nextPrimaryTerminalCardId,
  removeTerminalLaunchMode,
  removeTerminalSession,
  retainTerminalLaunchModesForCards,
  retainTerminalSessionsForCards,
  type TerminalLaunchModes,
  terminalLaunchModeLabel,
  terminalCardIds,
  updateKnownTerminalSession,
  updateTerminalLaunchMode,
} from './terminalSessionState';
import {
  captureScrollAnchor,
  rememberScrollAnchor,
  resolveScrollTop,
  shouldRestoreAfterTerminalWrite,
  type TerminalScrollAnchor,
} from './terminalScrollState';
import {
  createFrameCoalescer,
  type FrameCoalescer,
} from './frameCoalescer';
import { writeCardRectStyle } from './cardStyleWriter';
import { bringCardToFrontState } from './cardStackState';
import { currentDetectorDebug } from './detectorDebugState';
import {
  terminalEarlyExitNotice,
  terminalLaunchNotice,
} from './terminalProcessNotice';
import { createTerminalClipboard } from './terminalClipboard';
import {
  shouldBlurTerminalForPointerDown,
  terminalFocusBoundary,
} from './terminalFocus';
import { attachShellIntegrationDecorations } from './terminalShellIntegration';
import { createActivityMeter } from './activityMeter';
import { prefersReducedMotion } from './reducedMotion';
import { TerminalInstallHintPanel } from './TerminalInstallHintPanel';
import {
  createWaitingAdPlacement,
  detectorTerminalIdForWaitingAd,
  isWaitingAdPlacementCurrent,
  isWaitingAdVisibleOnCard,
  shouldReplaceWaitingAdPlacement,
  type WaitingAdPlacement,
} from './waitingAdPlacement';

const BoardScaleContext = createContext(1);

const creative = {
  id: 'neon-branching-001',
  sponsor: 'Neon',
  title: 'Branch Postgres for every agent run',
  url: 'https://kickbacks.ai/sponsors/neon',
};

const MIN_CARD_WIDTH = 260;
const MIN_CARD_HEIGHT = 180;
// Fit the local xterm grid every ResizeObserver tick, but coalesce the PTY
// SIGWINCH so a zoom or drag gesture doesn't flood the child process.
const TERMINAL_RESIZE_DEBOUNCE_MS = 120;
// Axis scaffolding only — never fabricated values. Real per-day earnings render
// here once sponsor events are credited; until then the chart shows an honest
// empty state.
const EARNING_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let browserPreviewApi: KickbacksApi | undefined;

function kickbacksApi(): KickbacksApi {
  if (window.kickbacks) return window.kickbacks;
  browserPreviewApi ??= createBrowserPreviewApi();
  return browserPreviewApi;
}

function createBrowserPreviewApi(): KickbacksApi {
  let previewSettings = { ...DEFAULT_USER_SETTINGS };
  const previewEvents: SafeAdEvent[] = [];
  return {
    async login(req) {
      previewSettings = normalizeUserSettings({
        ...previewSettings,
        email: req.email,
        name: req.name,
      });
      return {
        settings: previewSettings,
        user: {
          id: 'browser-preview-user',
          name: previewSettings.name || 'Kickbacks User',
          email: previewSettings.email || 'local@kickbacks.test',
        },
      };
    },
    async loadSettings() {
      return previewSettings;
    },
    async saveSettings(settingsInput) {
      previewSettings = normalizeUserSettings({
        ...previewSettings,
        ...settingsInput,
      });
      return previewSettings;
    },
    async spawnTerminal() {
      return {
        ok: true as const,
        id: 'browser-preview-terminal',
        launchMode: 'shell',
        fallbackReason:
          'Preview only — no terminal backend in the browser. Run the Kickbacks desktop app for a live, typable shell.',
      };
    },
    writeTerminal() {},
    resizeTerminal() {},
    killTerminal() {},
    detachTerminal() {},
    replayTerminal() {},
    reapTerminals() {},
    onTerminalData() {
      return () => {};
    },
    onTerminalExit() {
      return () => {};
    },
    onTerminalLaunchFailed() {
      return () => {};
    },
    async recordAdImpression(req) {
      return {
        accepted: false,
        label: 'Waiting for thinking line',
        reason: 'thinking-line-not-detected',
        retainedEvents: previewEvents.length,
      };
    },
    async recordAdClick(req) {
      return {
        accepted: false,
        label: 'Waiting for thinking line',
        reason: 'thinking-line-not-detected',
        retainedEvents: previewEvents.length,
      };
    },
    async listAdEvents() {
      return [...previewEvents];
    },
    async earningStatus(req) {
      return {
        found: false,
        terminalId: req.terminalId,
        checkedAt: Date.now(),
        payable: false,
        reason: 'terminal-not-found',
        label: 'Browser preview has no backend detector',
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
    },
    async openExternal() {
      return { ok: true };
    },
    async loadTerminalSettings() {
      return { ...DEFAULT_TERMINAL_SETTINGS };
    },
    async saveTerminalSettings(next) {
      return terminalSettingsFromJson(next);
    },
  };
}

export function App() {
  const [user, setUser] = useState<KickbacksUser | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>('account');
  const [waitingAdPlacement, setWaitingAdPlacement] =
    useState<WaitingAdPlacement | null>(null);
  const waitingAdPlacementRef = useRef<WaitingAdPlacement | null>(null);
  const [trustDebug, setTrustDebug] = useState<TrustDebugSnapshot | null>(null);
  const [primaryTerminalCardId, setPrimaryTerminalCardId] =
    useState<string | null>(DEFAULT_TERMINAL_CARD_ID);
  const [terminalSessions, setTerminalSessions] = useState<
    Record<string, string | null>
  >(() => defaultTerminalSessions());
  const [terminalLaunchModes, setTerminalLaunchModes] = useState(() =>
    defaultTerminalLaunchModes(),
  );
  const [nextTerminalCardIndex, setNextTerminalCardIndex] = useState(2);
  const [earningDebug, setEarningDebug] =
    useState<EarningStatusResponse | null>(null);
  const [verifiedEvents, setVerifiedEvents] = useState<SafeAdEvent[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [status, setStatus] = useState('Local mock ledger ready');
  const [deck, setDeck] = useState<KickbacksDeck>(() => defaultKickbacksDeck());
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(
    DEFAULT_TERMINAL_SETTINGS,
  );
  const terminalSettingsSaveTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const sessionId = useMemo(createSessionId, []);
  const api = kickbacksApi();
  const lastAutomaticAdAtRef = useRef<number | null>(null);
  const sponsorClickInFlightRef = useRef(false);
  const verifiedEventsRef = useRef<SafeAdEvent[]>([]);
  const terminalCardIdsRef = useRef<Set<string>>(
    terminalCardIds(defaultKickbacksDeck().cards),
  );
  const trustMonitorRef = useRef<ReturnType<
    typeof createLocalTrustSignalMonitor
  > | null>(null);

  const activeTerminalId = primaryTerminalCardId
    ? terminalSessions[primaryTerminalCardId] ?? null
    : null;
  waitingAdPlacementRef.current = waitingAdPlacement;
  const detectorTerminalId = detectorTerminalIdForWaitingAd(
    waitingAdPlacement,
    activeTerminalId,
  );
  const currentEarningDebug = currentDetectorDebug(
    earningDebug,
    detectorTerminalId,
  );

  const earning = earningStateForSession({
    isLoggedIn: Boolean(user),
    privacyConsent,
  });
  const creditedAmount = verifiedEvents.reduce(
    (total, event) => total + eventCreditUsd(event),
    0,
  );
  const canAttemptSponsorPlacement = earning.eligible && Boolean(activeTerminalId);
  const detectorLabel = currentEarningDebug?.payable
    ? 'Thinking verified'
    : (currentEarningDebug?.label ?? 'Detector starting');
  const adsCreditedLastHour = countFiveSecondAdsLastHour(verifiedEvents);
  const proofState = sessionProofState({
    activeTerminalId: detectorTerminalId,
    detectorPayable: Boolean(currentEarningDebug?.payable),
    earningEligible: earning.eligible,
    hourlyAdCapReached:
      adsCreditedLastHour >= FIVE_SECOND_AD_CREDIT_LIMIT_PER_HOUR,
    localAdWindowCreditable: Boolean(
      trustDebug &&
        trustDebug.input.adVisibleMs >= FIVE_SECOND_AD_RENDERED_MS &&
        trustDebug.input.adFocusedMs >= FIVE_SECOND_AD_RENDERED_MS,
    ),
    waitingAdVisible: Boolean(waitingAdPlacement),
  });

  useEffect(() => {
    verifiedEventsRef.current = verifiedEvents;
  }, [verifiedEvents]);

  // Reap detached PTY sessions whose terminal card has been removed from the
  // deck. StrictMode remounts don't change the deck, so live sessions survive.
  useEffect(() => {
    kickbacksApi().reapTerminals({
      cardIds: [...terminalCardIds(deck.cards)],
    });
  }, [deck.cards]);

  // Load persisted terminal settings once; new terminals consult them at spawn.
  useEffect(() => {
    let active = true;
    void kickbacksApi()
      .loadTerminalSettings()
      .then((loaded) => {
        if (active) setTerminalSettings(loaded);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateTerminalSettings(next: TerminalSettings) {
    setTerminalSettings(next);
    if (terminalSettingsSaveTimer.current !== null) {
      clearTimeout(terminalSettingsSaveTimer.current);
    }
    terminalSettingsSaveTimer.current = setTimeout(() => {
      terminalSettingsSaveTimer.current = null;
      void kickbacksApi()
        .saveTerminalSettings(next)
        .then((saved) => setTerminalSettings(saved));
    }, 300);
  }

  useEffect(() => {
    const monitor = createLocalTrustSignalMonitor();
    trustMonitorRef.current = monitor;
    const refresh = () => {
      setTrustDebug(
        monitor.snapshot(countFiveSecondAdsLastHour(verifiedEventsRef.current)),
      );
    };
    refresh();
    const intervalId = window.setInterval(refresh, 1_000);
    return () => {
      window.clearInterval(intervalId);
      monitor.dispose();
      trustMonitorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monitor = trustMonitorRef.current;
    if (!monitor) return;
    if (waitingAdPlacement) {
      monitor.startAdWindow();
    } else {
      monitor.stopAdWindow();
    }
  }, [waitingAdPlacement]);

  useEffect(() => {
    void api.loadSettings().then((loaded) => {
      setSettings(loaded);
      setLoginName(loaded.name);
      setLoginEmail(loaded.email);
    });
    void api.listAdEvents().then((events) => {
      setVerifiedEvents(events);
      setEventCount(events.length);
    });
  }, [api]);

  useEffect(() => {
    if (!detectorTerminalId) {
      setEarningDebug(null);
      return undefined;
    }
    setEarningDebug(null);
    let cancelled = false;
    const refresh = () => {
      void api.earningStatus({ terminalId: detectorTerminalId }).then((debug) => {
        if (!cancelled && debug.terminalId === detectorTerminalId) {
          setEarningDebug(debug);
        }
      });
    };
    refresh();
    const intervalId = window.setInterval(refresh, 750);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [api, detectorTerminalId]);

  useEffect(() => {
    if (waitingAdPlacement && currentEarningDebug?.payable) return;

    const now = Date.now();
    const next = nextAutomaticSponsorAdPollState({
      activeTerminalId,
      eligible: earning.eligible,
      lastServedAt: lastAutomaticAdAtRef.current,
      now,
      payable: Boolean(currentEarningDebug?.payable),
    });

    lastAutomaticAdAtRef.current = next.lastServedAt;

    if (!currentEarningDebug?.payable) {
      setWaitingAdPlacement(null);
      return;
    }

    if (waitingAdPlacement) return;
    if (!next.serve) return;
    void showWaitingPlacement();
  }, [
    activeTerminalId,
    earning.eligible,
    currentEarningDebug?.payable,
    waitingAdPlacement,
  ]);

  function addTerminalCard() {
    setDeck((current) => {
      const terminalCount = current.cards.filter(
        (card) => card.kind === 'terminal',
      ).length;
      const maxZ = Math.max(...current.cards.map((card) => card.zIndex), 1);
      const id = `terminal-card-${nextTerminalCardIndex}`;
      setNextTerminalCardIndex((value) => value + 1);
      terminalCardIdsRef.current = new Set([
        ...terminalCardIdsRef.current,
        id,
      ]);
      setTerminalSessions((sessions) => ({ ...sessions, [id]: null }));
      setTerminalLaunchModes((modes) => ({ ...modes, [id]: null }));
      setPrimaryTerminalCardId(id);

      return {
        ...current,
        cards: [
          ...current.cards,
          {
            id,
            kind: 'terminal',
            title: `Terminal ${terminalCount + 1}`,
            rect: {
              x: 40 + terminalCount * 24,
              y: 40 + terminalCount * 20,
              width: 820,
              height: 520,
            },
            zIndex: maxZ + 1,
          },
        ],
      };
    });
  }

  function closeTerminalCard(cardId: string) {
    const terminalId = terminalSessions[cardId];
    if (terminalId) api.killTerminal({ id: terminalId });

    setTerminalSessions((sessions) => {
      return removeTerminalSession(sessions, cardId);
    });
    setTerminalLaunchModes((modes) => removeTerminalLaunchMode(modes, cardId));

    setDeck((current) => {
      const cards = current.cards.filter((card) => card.id !== cardId);
      if (cards.length === current.cards.length) return current;
      terminalCardIdsRef.current = terminalCardIds(cards);

      if (primaryTerminalCardId === cardId) {
        setPrimaryTerminalCardId(nextPrimaryTerminalCardId(current.cards, cardId));
      }

      return { ...current, cards };
    });
    setStatus('Terminal exit requested');
    setWaitingAdPlacement((placement) =>
      placement?.cardId === cardId ? null : placement,
    );
  }

  function onTerminalReady(
    cardId: string,
    response: PtySpawnResponse | null,
  ) {
    const success = response && response.ok ? response : null;
    setTerminalSessions((sessions) =>
      updateKnownTerminalSession({
        cardId,
        knownCardIds: terminalCardIdsRef.current,
        sessions,
        terminalId: success?.id ?? null,
      }),
    );
    setTerminalLaunchModes((modes) =>
      updateTerminalLaunchMode({
        cardId,
        knownCardIds: terminalCardIdsRef.current,
        launchMode: success?.launchMode ?? null,
        modes,
      }),
    );
  }

  function onTerminalExited(cardId: string) {
    setTerminalSessions((sessions) => {
      const nextSessions = updateKnownTerminalSession({
        cardId,
        knownCardIds: terminalCardIdsRef.current,
        sessions,
        terminalId: null,
      });
      if (primaryTerminalCardId === cardId) {
        setPrimaryTerminalCardId(
          nextLiveTerminalCardId({
            cards: deck.cards,
            excludingCardId: cardId,
            sessions: nextSessions,
          }) ?? cardId,
        );
      }
      return nextSessions;
    });
    setTerminalLaunchModes((modes) =>
      updateTerminalLaunchMode({
        cardId,
        knownCardIds: terminalCardIdsRef.current,
        launchMode: 'exited',
        modes,
      }),
    );
    setWaitingAdPlacement((placement) =>
      placement?.cardId === cardId ? null : placement,
    );
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await api.login({
      name: loginName,
      email: loginEmail,
    });
    setUser(response.user);
    setSettings(response.settings);
    setStatus('Signed in to local show mode');
  }

  async function saveSettings() {
    const saved = await api.saveSettings(settings);
    setSettings(saved);
    setUser((current) =>
      current
        ? {
            ...current,
            name: saved.name || current.name,
            email: saved.email || current.email,
          }
        : current,
    );
    setStatus('Settings saved locally');
  }

  async function showWaitingPlacement() {
    if (!user || !earning.eligible) return;
    const placement = createWaitingAdPlacement(
      primaryTerminalCardId,
      activeTerminalId,
    );
    if (!placement) {
      setStatus('Terminal session is still starting');
      return;
    }
    if (!shouldReplaceWaitingAdPlacement(waitingAdPlacement, placement)) {
      setStatus('5 second sponsor ad already displayed');
      return;
    }
    setWaitingAdPlacement(placement);
    setStatus('5 second sponsor ad displayed');
  }

  useEffect(() => {
    if (!waitingAdPlacement || !user || !earning.eligible) {
      return undefined;
    }

    let cancelled = false;
    const scheduledPlacement = waitingAdPlacement;
    const recordFiveSecondAd = async () => {
      if (
        !isWaitingAdPlacementCurrent(
          waitingAdPlacementRef.current,
          scheduledPlacement,
        )
      ) {
        return;
      }
      const monitor = trustMonitorRef.current;
      const creditedAdWindow = monitor?.consumeCreditableAdWindowIntervalSnapshot(
          FIVE_SECOND_AD_RENDERED_MS,
          countFiveSecondAdsLastHour(verifiedEventsRef.current),
        );
      if (!creditedAdWindow) {
        setStatus('Waiting for 5 focused visible seconds before crediting ad');
        return;
      }
      if (
        !isWaitingAdPlacementCurrent(
          waitingAdPlacementRef.current,
          scheduledPlacement,
        )
      ) {
        return;
      }
      const response = await api.recordAdImpression({
        userId: user.id,
        sessionId,
        terminalId: scheduledPlacement.terminalId,
        placement: 'thinking-line',
        advertiser: creative.sponsor,
        creativeId: creative.id,
        trust: creditedAdWindow.summary,
        renderedMs: FIVE_SECOND_AD_RENDERED_MS,
      });
      if (cancelled) return;
      if (!response.accepted) {
        setStatus(`Not payable: ${response.label}`);
        if (response.reason === 'hourly-ad-limit') {
          setWaitingAdPlacement(null);
        }
        return;
      }
      setVerifiedEvents((events) => [...events, response.event]);
      setEventCount(response.retainedEvents);
      setStatus('Verified 5 second sponsor ad recorded');
    };

    const intervalId = window.setInterval(
      recordFiveSecondAd,
      FIVE_SECOND_AD_RENDERED_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    api,
    earning.eligible,
    sessionId,
    user,
    waitingAdPlacement,
  ]);

  async function openSponsor(ownerTerminalId?: string) {
    if (sponsorClickInFlightRef.current) return;
    sponsorClickInFlightRef.current = true;

    try {
      const openResponse = await api.openExternal({ url: creative.url });
      if (!openResponse.ok) {
        setStatus('Sponsor link did not open');
        return;
      }

      if (!user || !earning.eligible) {
        setStatus('Sponsor link opened');
        return;
      }
      const creditedTerminalId = ownerTerminalId ?? activeTerminalId;
      if (!creditedTerminalId) {
        setStatus('Sponsor link opened; terminal session is still starting');
        return;
      }

      const response = await api.recordAdClick({
        userId: user.id,
        sessionId,
        terminalId: creditedTerminalId,
        placement: ownerTerminalId ? 'thinking-line' : 'sidebar',
        advertiser: creative.sponsor,
        creativeId: creative.id,
        trust: trustMonitorRef.current?.snapshot(
          countFiveSecondAdsLastHour(verifiedEventsRef.current),
        ).summary,
        destinationUrl: creative.url,
      });
      if (!response.accepted) {
        setStatus(`Sponsor link opened; not payable: ${response.label}`);
        return;
      }
      setVerifiedEvents((events) => [...events, response.event]);
      setEventCount(response.retainedEvents);
      setStatus('Verified sponsor click recorded');
    } finally {
      sponsorClickInFlightRef.current = false;
    }
  }

  function signOut() {
    setUser(null);
    setStatus('Local mock ledger ready');
  }

  function updateCardRect(cardId: string, rect: KickbacksRect) {
    setDeck((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === cardId ? { ...card, rect } : card,
      ),
    }));
  }

  function bringCardToFront(cardId: string) {
    setDeck((current) => {
      const next = bringCardToFrontState(current.cards, cardId);
      if (next.primaryTerminalCardId) {
        setPrimaryTerminalCardId(next.primaryTerminalCardId);
      }
      if (!next.changed) return current;
      return { ...current, cards: [...next.cards] };
    });
  }

  function setViewport(viewport: KickbacksDeck['viewport']) {
    setDeck((current) => ({ ...current, viewport }));
  }

  function resetWorkspaceView() {
    const nextDeck = defaultKickbacksDeck();
    const nextTerminalCardIds = terminalCardIds(nextDeck.cards);
    terminalCardIdsRef.current = nextTerminalCardIds;
    setDeck(nextDeck);
    setPrimaryTerminalCardId(DEFAULT_TERMINAL_CARD_ID);
    setTerminalSessions((sessions) => {
      const retainedSessions = retainTerminalSessionsForCards({
        cardIds: nextTerminalCardIds,
        sessions,
      });
      setTerminalLaunchModes((modes) =>
        retainTerminalLaunchModesForCards({
          cardIds: nextTerminalCardIds,
          modes,
          sessions: retainedSessions,
        }),
      );
      return retainedSessions;
    });
    setNextTerminalCardIndex(2);
    setWaitingAdPlacement(null);
    setEarningDebug(null);
    lastAutomaticAdAtRef.current = null;
  }

  if (!user) {
    return (
      <main className="login-screen">
        <header className="public-topbar">
          <div className="brand-lockup">
            <BrandMark />
            <strong>Kickbacks.ai</strong>
          </div>
          <nav aria-label="Public links">
            <a href="#home">Home</a>
            <a href="#privacy">Privacy</a>
          </nav>
        </header>
        <section className="login-hero" aria-label="Kickbacks sign in">
          <div className="login-copy">
            <span className="portal-chip">
              <span />
              User earnings portal
            </span>
            <h1>
              Your terminal, <span className="accent">earning its keep</span>.
            </h1>
            <p>
              Sign in to your private desktop dashboard — credited sponsor
              events, payout status, and recent activity from local CLI
              sessions, all on this machine.
            </p>
          </div>
          <form className="login-form" onSubmit={login}>
            <button className="auth-button" type="submit">
              <span className="google-glyph">G</span>
              Continue with Google
            </button>
            <div className="auth-divider">
              <span />
              <strong>or</strong>
              <span />
            </div>
            <button className="auth-button" type="submit">
              <Apple size={16} />
              Continue with Apple
            </button>
            <button className="auth-button" type="submit">
              <Mail size={16} />
              Continue with email
            </button>
            <label>
              Name
              <input
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                placeholder="Jane Developer"
              />
            </label>
            <label>
              Email
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="jane@example.com"
                type="email"
              />
            </label>
            <button className="primary-button login-submit" type="submit">
              <LogIn size={16} />
              Sign in
            </button>
            <p className="login-note">
              Test mode accepts any input. No terminal output is uploaded.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="deck-shell">
      <header className="workspace-topbar">
        <div className="brand-row">
          <BrandMark size="small" />
          <div className="brand-text">
            <strong>{deck.name}.ai</strong>
            <span>{status}</span>
          </div>
        </div>
        <div className="topbar-controls">
          <span className="auto-detect-pill">
            <SquareTerminal size={15} />
            Auto-detect model
          </span>
          <span
            className={
              currentEarningDebug?.payable ? 'detector-pill live' : 'detector-pill'
            }
          >
            {detectorLabel}
          </span>
          <span className={`proof-pill ${proofState.tone}`}>
            {proofState.label}
          </span>
          <label className="consent-toggle">
            <input
              checked={privacyConsent}
              onChange={(event) => setPrivacyConsent(event.target.checked)}
              type="checkbox"
            />
            Earning mode
          </label>
          <span className={earning.eligible ? 'pill success' : 'pill muted'}>
            {earning.label}
          </span>
          <span className="signed-in-pill">Signed in</span>
          <span className="user-email">{user.email}</span>
          <button
            className="top-icon-button"
            title="Settings"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </button>
          <button className="sign-out-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="workspace-frame">
        <nav className="left-rail" aria-label="Deck actions">
          <button
            className="rail-button"
            title="Add terminal card"
            onClick={addTerminalCard}
          >
            <SquareTerminal size={17} />
          </button>
          <button
            className="rail-button"
            title="Show waiting ad"
            disabled={!canAttemptSponsorPlacement}
            onClick={showWaitingPlacement}
          >
            <BadgeDollarSign size={17} />
          </button>
          <button
            className="rail-button"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} />
          </button>
          <span className="rail-divider" />
          <button
            className="rail-button"
            title="Zoom out"
            onClick={() =>
              setViewport({
                ...deck.viewport,
                scale: clampScale(deck.viewport.scale - 0.1),
              })
            }
          >
            <ZoomOut size={17} />
          </button>
          <button
            className="rail-button"
            title="Zoom in"
            onClick={() =>
              setViewport({
                ...deck.viewport,
                scale: clampScale(deck.viewport.scale + 0.1),
              })
            }
          >
            <ZoomIn size={17} />
          </button>
          <button
            className="rail-button"
            title="Reset view"
            onClick={resetWorkspaceView}
          >
            <Maximize2 size={17} />
          </button>
        </nav>

        <DeckCanvas
          deck={deck}
          terminalLaunchModes={terminalLaunchModes}
          setViewport={setViewport}
          updateCardRect={updateCardRect}
          bringCardToFront={bringCardToFront}
          closeCard={closeTerminalCard}
          cardContent={(card) => {
            if (card.kind === 'terminal') {
              const showWaitingAd =
                isWaitingAdVisibleOnCard(waitingAdPlacement, card.id);
              return (
                <TerminalCardContent
                  cardId={card.id}
                  waitingAdVisible={showWaitingAd}
                  onTerminalExit={() => onTerminalExited(card.id)}
                  onTerminalReady={(response) =>
                    onTerminalReady(card.id, response)
                  }
                >
                  {showWaitingAd ? (
                    <ThinkingPlacement
                      onOpenSponsor={() =>
                        openSponsor(waitingAdPlacement?.terminalId)
                      }
                    />
                  ) : null}
                </TerminalCardContent>
              );
            }
            if (card.kind === 'sponsor') {
              return (
                <SponsorCard
                  eligible={canAttemptSponsorPlacement}
                  debugStatus={currentEarningDebug}
                  proofState={proofState}
                  trustDebug={trustDebug}
                  showWaitingPlacement={showWaitingPlacement}
                  openSponsor={openSponsor}
                />
              );
            }
            return (
              <VerifiedEventsCard
                events={verifiedEvents}
                eventCount={eventCount}
                sessionId={sessionId}
              />
            );
          }}
        />
      </section>

      {settingsOpen ? (
        <SettingsDrawer
          activeSection={activeSettingsSection}
          setActiveSection={setActiveSettingsSection}
          settings={settings}
          setSettings={setSettings}
          saveSettings={saveSettings}
          terminalSettings={terminalSettings}
          setTerminalSettings={updateTerminalSettings}
          close={() => setSettingsOpen(false)}
          user={user}
          eventCount={eventCount}
          creditedAmount={creditedAmount}
          events={verifiedEvents}
        />
      ) : null}
    </main>
  );
}

function BrandMark({ size }: { size?: 'small' }) {
  return (
    <span className={size === 'small' ? 'brand-mark small' : 'brand-mark'}>
      K$
    </span>
  );
}

function DeckCanvas({
  deck,
  terminalLaunchModes,
  setViewport,
  updateCardRect,
  bringCardToFront,
  closeCard,
  cardContent,
}: {
  deck: KickbacksDeck;
  terminalLaunchModes: TerminalLaunchModes;
  setViewport: (viewport: KickbacksDeck['viewport']) => void;
  updateCardRect: (cardId: string, rect: KickbacksRect) => void;
  bringCardToFront: (cardId: string) => void;
  closeCard: (cardId: string) => void;
  cardContent: (card: KickbacksCard) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 2 || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: deck.viewport.panX,
      panY: deck.viewport.panY,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan) return;
    setViewport({
      ...deck.viewport,
      panX: pan.panX + event.clientX - pan.startX,
      panY: pan.panY + event.clientY - pan.startY,
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    panRef.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const nextScale = clampScale(
      deck.viewport.scale * Math.max(0.2, Math.min(5, 1 - event.deltaY / 800)),
    );
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const boardX = (localX - deck.viewport.panX) / deck.viewport.scale;
    const boardY = (localY - deck.viewport.panY) / deck.viewport.scale;
    setViewport({
      scale: nextScale,
      panX: localX - boardX * nextScale,
      panY: localY - boardY * nextScale,
    });
  }

  return (
    <div
      ref={viewportRef}
      className="deck-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={onWheel}
    >
      <div className="empty-hint" aria-hidden>
        <span>Right-drag to pan</span>
        <span>Scroll to zoom</span>
        <span>One Kickbacks deck</span>
      </div>
      <div
        className="deck-surface"
        style={{
          transform: `translate(${deck.viewport.panX}px, ${deck.viewport.panY}px) scale(${deck.viewport.scale})`,
        }}
      >
        <BoardScaleContext.Provider value={deck.viewport.scale}>
          {deck.cards.map((card) => (
            <CanvasCard
              key={card.id}
              card={card}
              scale={deck.viewport.scale}
              onClose={
                card.kind === 'terminal' ? () => closeCard(card.id) : undefined
              }
              onBringToFront={() => bringCardToFront(card.id)}
              onRectChange={(rect) => updateCardRect(card.id, rect)}
              headerKindLabel={
                card.kind === 'terminal'
                  ? `Terminal · ${terminalLaunchModeLabel(
                      terminalLaunchModes[card.id],
                    )}`
                  : undefined
              }
            >
              {cardContent(card)}
            </CanvasCard>
          ))}
        </BoardScaleContext.Provider>
      </div>
    </div>
  );
}

function CanvasCard({
  card,
  scale,
  onBringToFront,
  onClose,
  onRectChange,
  headerKindLabel,
  children,
}: {
  card: KickbacksCard;
  scale: number;
  onBringToFront: () => void;
  onClose?: () => void;
  onRectChange: (rect: KickbacksRect) => void;
  headerKindLabel?: string;
  children: ReactNode;
}) {
  const [workingRect, setWorkingRect] = useState(card.rect);
  const cardElementRef = useRef<HTMLElement | null>(null);
  const workingRectRef = useRef(card.rect);
  const rectWriterRef = useRef<FrameCoalescer<{
    mode: 'full' | 'position';
    rect: KickbacksRect;
  }> | null>(null);
  const dragRef = useRef<{
    type: 'drag' | 'resize';
    startX: number;
    startY: number;
    rect: KickbacksRect;
  } | null>(null);

  function writeElementRect(rect: KickbacksRect, mode: 'full' | 'position') {
    const element = cardElementRef.current;
    if (!element) return;
    writeCardRectStyle(element, rect, mode);
  }

  useEffect(() => {
    const writer = createFrameCoalescer<{
      mode: 'full' | 'position';
      rect: KickbacksRect;
    }>({
      cancelFrame: window.cancelAnimationFrame.bind(window),
      requestFrame: window.requestAnimationFrame.bind(window),
      write: ({ mode, rect }) => writeElementRect(rect, mode),
    });
    rectWriterRef.current = writer;
    return () => {
      writer.cancel();
      rectWriterRef.current = null;
    };
  }, []);

  useEffect(() => {
    rectWriterRef.current?.cancel();
    setWorkingRect(card.rect);
    workingRectRef.current = card.rect;
    writeElementRect(card.rect, 'full');
  }, [card.rect]);

  function setLiveRect(rect: KickbacksRect, mode: 'full' | 'position') {
    workingRectRef.current = rect;
    rectWriterRef.current?.request({ mode, rect });
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBringToFront();
    dragRef.current = {
      type: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      rect: workingRectRef.current,
    };
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBringToFront();
    dragRef.current = {
      type: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      rect: workingRectRef.current,
    };
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = (event.clientX - drag.startX) / scale;
    const deltaY = (event.clientY - drag.startY) / scale;
    const next =
      drag.type === 'drag'
        ? {
            ...drag.rect,
            x: drag.rect.x + deltaX,
            y: drag.rect.y + deltaY,
          }
        : {
            ...drag.rect,
            width: Math.max(MIN_CARD_WIDTH, drag.rect.width + deltaX),
            height: Math.max(MIN_CARD_HEIGHT, drag.rect.height + deltaY),
          };
    setLiveRect(next, drag.type === 'drag' ? 'position' : 'full');
  }

  function end(event: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const committedRect = workingRectRef.current;
    rectWriterRef.current?.cancel();
    writeElementRect(committedRect, 'full');
    setWorkingRect(committedRect);
    dragRef.current = null;
    onRectChange(committedRect);
  }

  return (
    <article
      ref={cardElementRef}
      className="canvas-card"
      data-card-kind={card.kind}
      style={
        {
          left: workingRect.x,
          top: workingRect.y,
          width: workingRect.width,
          height: workingRect.height,
          zIndex: card.zIndex,
          '--card-accent': cardAccent(card.kind),
        } as CSSProperties
      }
      onPointerDown={onBringToFront}
    >
      <header
        className="canvas-card-header"
        onPointerDown={beginDrag}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="title-dot" />
        <span>{card.title}</span>
        <span className="card-kind">
          {headerKindLabel ?? card.kind.replace('-', ' ')}
        </span>
        {onClose ? (
          <button
            type="button"
            className="canvas-card-close-button"
            aria-label="Close card"
            title="Close card"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
          >
            <X size={12} />
          </button>
        ) : null}
      </header>
      <div className="canvas-card-body">{children}</div>
      <div
        className="resize-corner"
        onPointerDown={beginResize}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </article>
  );
}

function TerminalCardContent({
  cardId,
  waitingAdVisible,
  onTerminalExit,
  onTerminalReady,
  children,
}: {
  cardId: string;
  waitingAdVisible: boolean;
  onTerminalExit: () => void;
  onTerminalReady: (response: PtySpawnResponse | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      className="terminal-card-content"
      data-waiting-ad={waitingAdVisible || undefined}
    >
      {children}
      <TerminalView
        cardId={cardId}
        onTerminalExit={onTerminalExit}
        onTerminalReady={onTerminalReady}
      />
    </div>
  );
}

function ThinkingPlacement({ onOpenSponsor }: { onOpenSponsor: () => void }) {
  return (
    <div className="thinking-placement">
      <ShieldCheck size={15} />
      <span>Sponsored while the agent is working:</span>
      <strong>{creative.title}</strong>
      <button onClick={onOpenSponsor}>
        <ExternalLink size={14} />
        Open
      </button>
    </div>
  );
}

function SponsorCard({
  eligible,
  debugStatus,
  proofState,
  trustDebug,
  showWaitingPlacement,
  openSponsor,
}: {
  eligible: boolean;
  debugStatus: EarningStatusResponse | null;
  proofState: SessionProofState;
  trustDebug: TrustDebugSnapshot | null;
  showWaitingPlacement: () => void;
  openSponsor: () => void;
}) {
  return (
    <div className="sponsor-card-content">
      <span className="sponsor-label">Kickbacks.ai sponsor</span>
      <h2>{creative.sponsor}</h2>
      <p>{creative.title}</p>
      <button
        className="primary-button full-width"
        disabled={!eligible}
        onClick={showWaitingPlacement}
      >
        <Play size={16} />
        Show waiting ad
      </button>
      <button
        className="secondary-button full-width"
        disabled={!eligible}
        onClick={openSponsor}
      >
        <ExternalLink size={16} />
        Sponsor link
      </button>
      <ProofStatusPanel proofState={proofState} />
      <DetectorDebugPanel status={debugStatus} />
      <TrustDebugPanel debug={trustDebug} />
    </div>
  );
}

function ProofStatusPanel({
  proofState,
}: {
  proofState: SessionProofState;
}) {
  return (
    <section className={`proof-debug ${proofState.tone}`} aria-label="Credit proof">
      <div className="detector-debug-header">
        <span className="debug-dot" />
        <strong>Credit proof</strong>
        <span className="trust-score">{proofState.reason}</span>
      </div>
      <p>{proofState.label}</p>
    </section>
  );
}

function DetectorDebugPanel({
  status,
}: {
  status: EarningStatusResponse | null;
}) {
  return (
    <section
      className={status?.payable ? 'detector-debug live' : 'detector-debug'}
      aria-label="Detector debug"
    >
      <div className="detector-debug-header">
        <span className="debug-dot" />
        <strong>Detector debug</strong>
      </div>
      <div className="debug-grid">
        <span>Provider</span>
        <strong>{status?.detectedProvider ?? 'not detected'}</strong>
        <span>Source</span>
        <strong>{verificationSourceLabel(status?.verificationSource)}</strong>
        <span>State</span>
        <strong>{activityStateLabel(status)}</strong>
        <span>Payable</span>
        <strong>{status?.payable ? 'yes' : 'no'}</strong>
        <span>Reason</span>
        <strong>{status?.reason ?? 'terminal-not-ready'}</strong>
        <span>Last active signal</span>
        <strong>{formatAge(status?.lastThinkingAgeMs ?? null)}</strong>
        <span>Thinking time</span>
        <strong>{formatThinkingTime(status)}</strong>
        <span>Output age</span>
        <strong>{formatAge(status?.lastOutputAgeMs ?? null)}</strong>
        <span>I/O bytes</span>
        <strong>
          {status ? `${status.inputBytes} / ${status.outputBytes}` : '0 / 0'}
        </strong>
      </div>
      <p>{status?.label ?? 'Waiting for terminal session.'}</p>
    </section>
  );
}

function TrustDebugPanel({ debug }: { debug: TrustDebugSnapshot | null }) {
  const summary = debug?.summary;
  const input = debug?.input;
  return (
    <section className="trust-debug" aria-label="Trust debug">
      <div className="detector-debug-header">
        <span className={summary?.level === 'high' ? 'debug-dot risk' : 'debug-dot'} />
        <strong>Credit confidence</strong>
        <span className="trust-score">
          {summary
            ? `${Math.round((1 - summary.score) * 100)} / ${confidenceLabel(summary.level)}`
            : 'starting'}
        </span>
      </div>
      <div className="debug-grid">
        <span>Signals</span>
        <strong>
          {summary?.reasons.map(trustReasonLabel).join(', ') || 'none yet'}
        </strong>
        <span>Ad window</span>
        <strong>{summary?.counters.adVisibleSeconds ?? '<5s'}</strong>
        <span>Ad focus</span>
        <strong>{formatDebugDuration(input?.adFocusedMs ?? 0)}</strong>
        <span>App focus</span>
        <strong>{summary?.counters.appFocusedSeconds ?? '<5s'}</strong>
        <span>Recent input</span>
        <strong>{summary?.counters.timeSinceHumanInput ?? '<5s'}</strong>
        <span>Mouse moves</span>
        <strong>{summary?.counters.mouseMoves ?? '0'}</strong>
        <span>Clicks / keys</span>
        <strong>
          {input ? `${input.clickCount} / ${input.keypressCount}` : '0 / 0'}
        </strong>
        <span>Input timing</span>
        <strong>{summary?.counters.interactionVariance ?? 'none'}</strong>
        <span>Pointer variation</span>
        <strong>{summary?.counters.pointerJitter ?? 'none'}</strong>
        <span>5 sec ads/hour</span>
        <strong>{summary?.counters.adsLastHour ?? '0'}</strong>
      </div>
      <p>Local-only raw input. Shared events keep only confidence, buckets, and reason codes.</p>
    </section>
  );
}

function VerifiedEventsCard({
  events,
  eventCount,
  sessionId,
}: {
  events: SafeAdEvent[];
  eventCount: number;
  sessionId: string;
}) {
  return (
    <div className="verified-card-content">
      <div className="metric-row">
        <span>Ad ledger</span>
        <strong>{eventCount} events</strong>
      </div>
      <div className="metric-row">
        <span>Session</span>
        <strong>{shortId(sessionId)}</strong>
      </div>
      <div className="metric-row">
        <span>Terminal output</span>
        <strong>Local only</strong>
      </div>
      <div className="event-log">
        {events.length === 0 ? (
          <p className="empty-copy">No verified ad events yet.</p>
        ) : (
          events.map((event) => (
            <div className="event-row" key={`${event.kind}-${event.at}`}>
              <span>{event.kind.replace('ad.', '')}</span>
              <strong>{event.placement}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsDrawer({
  activeSection,
  setActiveSection,
  settings,
  setSettings,
  saveSettings,
  terminalSettings,
  setTerminalSettings,
  close,
  user,
  eventCount,
  creditedAmount,
  events,
}: {
  activeSection: SettingsSectionId;
  setActiveSection: (section: SettingsSectionId) => void;
  settings: UserSettings;
  setSettings: (settings: UserSettings) => void;
  saveSettings: () => void;
  terminalSettings: TerminalSettings;
  setTerminalSettings: (settings: TerminalSettings) => void;
  close: () => void;
  user: KickbacksUser;
  eventCount: number;
  creditedAmount: number;
  events: SafeAdEvent[];
}) {
  const chartScaleMax = creditedAmount > 0 ? creditedAmount : 1;

  return (
    <div className="settings-backdrop" role="presentation">
      <section className="settings-page" aria-label="Kickbacks settings">
        <header className="settings-page-header">
          <div className="brand-lockup">
            <BrandMark size="small" />
            <strong>Kickbacks.ai</strong>
          </div>
          <div className="settings-user-strip">
            <span className="signed-in-pill">Signed in</span>
            <span>{user.email}</span>
            <button className="drawer-icon-button" aria-label="Close settings" onClick={close}>
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="settings-scroll">
          <section className="settings-metrics" aria-label="Earnings summary">
            <MetricCard
              label="Today"
              value={formatMoney(0)}
              detail="credited today"
              amount={0}
            />
            <MetricCard
              label="This month"
              value={formatMoney(creditedAmount)}
              detail="month-to-date"
              amount={creditedAmount}
            />
            <MetricCard
              label="Lifetime"
              value={formatMoney(creditedAmount)}
              detail="all-time credit"
              amount={creditedAmount}
            />
            <article className="settings-card earning-limits-card">
              <h3>Earning limits</h3>
              <LimitRow label="Hourly" value="$0.00 / $20.00" progress={0} detail="resets in 3 min" />
              <LimitRow label="Daily" value="$0.00 / $200.00" progress={0} detail="resets in 10h 3m" />
            </article>
          </section>

          <section className="settings-dashboard-grid">
            <article className="settings-card earnings-activity">
              <div className="section-title-row">
                <div>
                  <h2>Earnings Activity</h2>
                  <p>Credit grouped over the selected window.</p>
                </div>
                <div className="segmented-control" aria-label="Activity range">
                  <button>24h</button>
                  <button aria-pressed="true">7d</button>
                  <button>30d</button>
                </div>
              </div>
              <div
                className="chart-panel"
                aria-label="Seven day earnings chart"
                data-empty={creditedAmount <= 0 || undefined}
              >
                <div className="chart-scale">
                  <span>{formatMoney(chartScaleMax)}</span>
                  <span>{formatMoney(chartScaleMax * 0.66)}</span>
                  <span>{formatMoney(chartScaleMax * 0.33)}</span>
                  <span>$0</span>
                </div>
                <div className="bar-chart">
                  {EARNING_WEEKDAYS.map((label) => (
                    <div className="bar-column" key={label}>
                      <span style={{ height: '0%' }} />
                      <strong>{label}</strong>
                    </div>
                  ))}
                </div>
                {creditedAmount <= 0 ? (
                  <p className="chart-empty">No earnings in this range yet.</p>
                ) : null}
              </div>
              <p className="activity-total">
                {formatMoney(creditedAmount)} across {eventCount} verified events
              </p>
            </article>

            <article className="settings-card payouts-card">
              <h2>Payouts</h2>
              <p>
                Connect a Stripe Express account to receive payouts to your bank
                or debit card.
              </p>
              <div className="payout-status-panel">
                <div className="payout-status-title">
                  <span className="success-icon">
                    <CheckCircle2 size={23} />
                  </span>
                  <div>
                    <h3>
                      {settings.payoutStatus === 'connected'
                        ? 'Payouts connected'
                        : 'Payout setup ready'}
                    </h3>
                    <p>
                      {formatMoney(0)} paid out · {formatMoney(creditedAmount)} pending.
                    </p>
                  </div>
                </div>
                <button className="primary-button full-width">
                  <CreditCard size={16} />
                  Manage on Stripe
                </button>
                <p className="payout-review-note">
                  Every payout is manually reviewed before release. Click-farm
                  and bot earnings will not be paid.
                </p>
              </div>
            </article>
          </section>

          <section className="settings-card activity-ledger">
            <div className="section-title-row">
              <div>
                <h2>Activity Ledger</h2>
                <p>
                  Credited events from this account, retrieved on demand. Search
                  and filter happen locally on retrieved rows.
                </p>
              </div>
              <span className="retrieval-pill">
                {events.length > 0 ? 'Retrieved' : 'Not retrieved'}
              </span>
            </div>
            <div className="ledger-toolbar">
              <input placeholder="Search advertiser, event id, event type..." />
              <select defaultValue="all">
                <option value="all">All events</option>
                <option value="impression">Impressions</option>
                <option value="click">Clicks</option>
              </select>
              <span>{events.length} of {eventCount} rows</span>
            </div>
            <div className="ledger-list">
              {events.length === 0 ? (
                <div className="ledger-empty">
                  <span className="ledger-empty-glyph">
                    <WalletCards size={20} />
                  </span>
                  <h4>No events yet</h4>
                  <p>
                    Sponsored events you complete appear here, with proofs.
                    Retrieving checks the last 500 credited events for this
                    account.
                  </p>
                  <button className="secondary-button" type="button">
                    Retrieve activity
                  </button>
                </div>
              ) : (
                <div className="ledger-table">
                  <div className="ledger-header" aria-hidden>
                    <span>Time</span>
                    <span>Event</span>
                    <span>Advertiser</span>
                    <span>Event ID</span>
                    <span>Credit</span>
                  </div>
                  {events.map((event) => (
                    <div className="ledger-row" key={event.eventId}>
                      <time>{formatLedgerTime(event.at)}</time>
                      <span className={event.kind === 'ad.click' ? 'event-badge click' : 'event-badge'}>
                        {eventLabel(event)}
                      </span>
                      <span>{event.advertiser}</span>
                      <code>{shortId(event.eventId)}</code>
                      <strong>{formatCredit(eventCreditUsd(event))}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="settings-card account-settings-card">
            <div className="section-title-row">
              <div>
                <h2>Settings</h2>
                <p>Account, address, payout, and privacy controls for this desktop app.</p>
              </div>
              <button className="primary-button" onClick={saveSettings}>
                <Save size={16} />
                Save settings
              </button>
            </div>
            <nav className="settings-tabs" aria-label="Settings sections">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  {settingsIcon(section.id)}
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
            <div className="settings-tab-panel">
              {activeSection === 'account' ? (
                <SettingsPanel title="Account" summary="Show-mode identity for this local build.">
                  <Field
                    label="Name"
                    value={settings.name}
                    onChange={(name) => setSettings({ ...settings, name })}
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={settings.email}
                    onChange={(email) => setSettings({ ...settings, email })}
                  />
                </SettingsPanel>
              ) : null}

              {activeSection === 'address' ? (
                <SettingsPanel
                  title="Address"
                  summary="Stored locally for payout onboarding."
                >
                  <Field
                    label="Line 1"
                    value={settings.addressLine1}
                    onChange={(addressLine1) =>
                      setSettings({ ...settings, addressLine1 })
                    }
                  />
                  <Field
                    label="Line 2"
                    value={settings.addressLine2}
                    onChange={(addressLine2) =>
                      setSettings({ ...settings, addressLine2 })
                    }
                  />
                  <div className="field-grid">
                    <Field
                      label="City"
                      value={settings.city}
                      onChange={(city) => setSettings({ ...settings, city })}
                    />
                    <Field
                      label="Region"
                      value={settings.region}
                      onChange={(region) => setSettings({ ...settings, region })}
                    />
                  </div>
                  <div className="field-grid">
                    <Field
                      label="Postal"
                      value={settings.postalCode}
                      onChange={(postalCode) =>
                        setSettings({ ...settings, postalCode })
                      }
                    />
                    <Field
                      label="Country"
                      value={settings.country}
                      onChange={(country) =>
                        setSettings({ ...settings, country })
                      }
                    />
                  </div>
                </SettingsPanel>
              ) : null}

              {activeSection === 'payout' ? (
                <SettingsPanel
                  title="Payout"
                  summary="Stripe fields are present for the flow; no live Stripe connection yet."
                >
                  <Field
                    label="Stripe email"
                    type="email"
                    value={settings.stripeEmail}
                    onChange={(stripeEmail) =>
                      setSettings({ ...settings, stripeEmail })
                    }
                  />
                  <div className="settings-row">
                    <span>Revenue share</span>
                    <strong>{settings.revenueSharePercent}%</strong>
                  </div>
                  <div className="settings-row">
                    <span>Stripe status</span>
                    <strong>{settings.payoutStatus.replace('_', ' ')}</strong>
                  </div>
                </SettingsPanel>
              ) : null}

              {activeSection === 'privacy' ? (
                <SettingsPanel
                  title="Privacy"
                  summary="The terminal renderer sees local PTY bytes; ad telemetry does not retain them."
                >
                  <div className="settings-row">
                    <span>Terminal transcript upload</span>
                    <strong>Off</strong>
                  </div>
                  <div className="settings-row">
                    <span>Prompt or command capture</span>
                    <strong>Off</strong>
                  </div>
                  <div className="settings-row">
                    <span>Ad event payload</span>
                    <strong>Metadata only</strong>
                  </div>
                </SettingsPanel>
              ) : null}

              {activeSection === 'terminal' ? (
                <TerminalSettingsPanel
                  value={terminalSettings}
                  onChange={setTerminalSettings}
                />
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

const SHELL_CHOICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Automatic (PowerShell → cmd)' },
  { value: 'pwsh', label: 'PowerShell 7 (pwsh)' },
  { value: 'powershell', label: 'Windows PowerShell' },
  { value: 'cmd', label: 'Command Prompt (cmd)' },
  { value: 'custom', label: 'Custom path…' },
];

function shellChoiceSelectValue(choice: TerminalShellChoice): string {
  return typeof choice === 'object' ? 'custom' : choice;
}

function TerminalSettingsPanel({
  value,
  onChange,
}: {
  value: TerminalSettings;
  onChange: (next: TerminalSettings) => void;
}) {
  const selectValue = shellChoiceSelectValue(value.defaultShell);
  const customPath =
    typeof value.defaultShell === 'object' ? value.defaultShell.customPath : '';

  return (
    <SettingsPanel
      title="Terminal"
      summary="Pick the shell new terminals launch and tune Windows PTY behavior."
    >
      <label className="settings-field">
        <span>Default shell</span>
        <select
          value={selectValue}
          onChange={(event) => {
            const next = event.target.value;
            onChange({
              ...value,
              defaultShell:
                next === 'custom'
                  ? { customPath }
                  : (next as TerminalShellChoice),
            });
          }}
        >
          {SHELL_CHOICE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {selectValue === 'custom' ? (
        <Field
          label="Shell executable path"
          value={customPath}
          onChange={(path) =>
            onChange({ ...value, defaultShell: { customPath: path } })
          }
        />
      ) : null}

      <ToggleRow
        label="Shell integration"
        help="Render OSC 133 prompt marks as exit-code gutter dots."
        checked={value.shellIntegration}
        onChange={(shellIntegration) =>
          onChange({ ...value, shellIntegration })
        }
      />
      <ToggleRow
        label="Bundled ConPTY (Windows)"
        help="Use the conpty.dll shipped with the app instead of the OS one."
        checked={value.useConptyDll}
        onChange={(useConptyDll) => onChange({ ...value, useConptyDll })}
      />
    </SettingsPanel>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-text">
        <span>{label}</span>
        <p>{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="settings-toggle"
        data-on={checked || undefined}
        onClick={() => onChange(!checked)}
      >
        {checked ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  amount,
}: {
  label: string;
  value: string;
  detail: string;
  /** Real credited amount. The aurora glow is structurally gated to > 0. */
  amount: number;
}) {
  return (
    <article
      className="settings-card metric-card"
      data-tone="earnings"
      data-zero={amount > 0 ? undefined : true}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function LimitRow({
  label,
  value,
  progress,
  detail,
}: {
  label: string;
  value: string;
  progress: number;
  detail: string;
}) {
  return (
    <div className="limit-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="limit-meter">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>{detail}</p>
    </div>
  );
}

function SettingsPanel({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-panel">
      <header>
        <h3>{title}</h3>
        <p>{summary}</p>
      </header>
      <div className="settings-panel-body">{children}</div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      {props.label}
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

interface XtermCoreInternals {
  _core?: {
    _renderService?: {
      dimensions?: { css?: { cell?: { width: number; height: number } } };
    };
  };
}

function readTerminalHostLayout(host: HTMLElement): {
  paddingX: number;
  paddingY: number;
  scrollbarGutter: number;
  scrollbarRail: number;
  fitExtraRows: number;
} {
  const style = getComputedStyle(host);
  const readPx = (value: string, fallback: number) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    paddingX:
      readPx(style.paddingLeft, 10) + readPx(style.paddingRight, 10),
    paddingY:
      readPx(style.paddingTop, 10) + readPx(style.paddingBottom, 5),
    scrollbarGutter: readPx(
      style.getPropertyValue('--terminal-scrollbar-gutter'),
      20,
    ),
    scrollbarRail: readPx(
      style.getPropertyValue('--terminal-scrollbar-rail'),
      14,
    ),
    fitExtraRows: readPx(
      style.getPropertyValue('--terminal-grid-fit-extra-rows'),
      1,
    ),
  };
}

function terminalViewport(terminal: XTerm): HTMLDivElement | null {
  const viewport = terminal.element?.querySelector('.xterm-viewport');
  return viewport instanceof HTMLDivElement ? viewport : null;
}

function captureTerminalViewportAnchor(
  terminal: XTerm,
): TerminalScrollAnchor | null {
  const viewport = terminalViewport(terminal);
  if (!viewport) return null;
  return captureScrollAnchor({
    clientHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
  });
}

function queueTerminalViewportScrollRestore(
  terminal: XTerm,
  anchor: TerminalScrollAnchor | null,
): void {
  if (anchor === null) return;
  const maxAttempts = 12;
  let attempts = 0;

  const apply = () => {
    if (attempts >= maxAttempts) return;
    attempts += 1;

    const viewport = terminalViewport(terminal);
    if (!viewport) {
      requestAnimationFrame(apply);
      return;
    }

    const nextScrollTop = resolveScrollTop(anchor, {
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    if (nextScrollTop === null) {
      requestAnimationFrame(apply);
      return;
    }

    viewport.scrollTop = nextScrollTop;
  };

  requestAnimationFrame(apply);
}

function fitTerminalWithGutter(
  terminal: XTerm,
  host: HTMLElement,
): { cols: number; rows: number } | null {
  // xterm's `dimensions` is a getter that THROWS (not returns undefined) when
  // the render service has no measured cell yet — e.g. the ResizeObserver fires
  // before the first paint. Optional chaining can't guard a throw, so wrap it.
  let cell: { width: number; height: number } | undefined;
  try {
    cell = (terminal as unknown as XtermCoreInternals)._core?._renderService
      ?.dimensions?.css?.cell;
  } catch {
    return null;
  }
  if (!cell?.width || !cell?.height) return null;

  const layout = readTerminalHostLayout(host);
  const width =
    host.clientWidth -
    layout.paddingX -
    layout.scrollbarGutter -
    layout.scrollbarRail;
  const height =
    host.clientHeight - layout.paddingY - cell.height * layout.fitExtraRows;

  if (width <= 0 || height <= 0) return null;

  const cols = Math.max(2, Math.floor(width / cell.width));
  const rows = Math.max(1, Math.floor(height / cell.height));

  if (terminal.cols !== cols || terminal.rows !== rows) {
    terminal.resize(cols, rows);
  }

  return { cols, rows };
}

function TerminalView({
  cardId,
  onTerminalExit,
  onTerminalReady,
}: {
  cardId: string;
  onTerminalExit: () => void;
  onTerminalReady: (response: PtySpawnResponse | null) => void;
}) {
  const boardScale = useContext(BoardScaleContext);
  const boardScaleRef = useRef(boardScale);
  const cardIdRef = useRef(cardId);
  const onTerminalExitRef = useRef(onTerminalExit);
  const onTerminalReadyRef = useRef(onTerminalReady);
  boardScaleRef.current = boardScale;
  cardIdRef.current = cardId;
  onTerminalExitRef.current = onTerminalExit;
  onTerminalReadyRef.current = onTerminalReady;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastScrollAnchorRef = useRef<TerminalScrollAnchor | null>(null);
  const replayScrollAnchorRef = useRef<TerminalScrollAnchor | null>(null);
  const [spawnFailure, setSpawnFailure] = useState<PtySpawnLaunchError | null>(
    null,
  );
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const api = kickbacksApi();
    let disposed = false;
    let terminalId: string | undefined;
    let terminalHadOutput = false;
    const isWindows =
      typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
    const terminal = new XTerm({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily:
        '"JetBrains Mono Variable", "JetBrains Mono", "CaskaydiaCove Nerd Font", "Symbols Nerd Font Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace, "Apple Color Emoji", "Segoe UI Emoji"',
      fontSize: 13,
      fontWeight: 400,
      fontWeightBold: 700,
      lineHeight: 1.35,
      scrollback: 5000,
      minimumContrastRatio: 3,
      smoothScrollDuration: 120,
      ...(isWindows
        ? { windowsPty: { backend: 'conpty' as const } }
        : {}),
      theme: {
        background: '#0c0e13',
        foreground: '#dfe3ec',
        cursor: '#8fb6ff',
        cursorAccent: '#0c0e13',
        selectionBackground: 'rgba(96, 119, 255, 0.32)',
        black: '#0c0e13',
        red: '#ff7a85',
        green: '#7fd0a3',
        yellow: '#e7c478',
        blue: '#8fb6ff',
        magenta: '#c4a4ff',
        cyan: '#86dbe7',
        white: '#dfe3ec',
        brightBlack: '#5b6273',
        brightRed: '#ff9ca4',
        brightGreen: '#a3e4c0',
        brightYellow: '#f0d79a',
        brightBlue: '#b6cdff',
        brightMagenta: '#dcc3ff',
        brightCyan: '#aae7ef',
        brightWhite: '#f4f6fb',
      },
    });
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';
    terminal.loadAddon(new SearchAddon());
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        void api.openExternal({ url: uri });
      }),
    );
    terminal.open(element);
    const detachPointerFix = attachTerminalBoardPointerFix(
      element,
      terminal,
      () => boardScaleRef.current,
    );
    const detachClipboard = createTerminalClipboard({
      terminal,
      host: element,
      writeToPty: (data) => {
        if (terminalId) api.writeTerminal({ id: terminalId, data });
      },
      readClipboard:
        typeof navigator !== 'undefined' && navigator.clipboard?.readText
          ? () => navigator.clipboard.readText()
          : undefined,
      writeClipboard:
        typeof navigator !== 'undefined' && navigator.clipboard?.writeText
          ? (text) => navigator.clipboard.writeText(text)
          : undefined,
    });
    const focusBoundary = terminalFocusBoundary(element);
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (
        shouldBlurTerminalForPointerDown({
          host: focusBoundary,
          activeElement: document.activeElement,
          pointerTarget: event.target,
        })
      ) {
        terminal.blur();
      }
    };
    document.addEventListener('pointerdown', onDocumentPointerDown, true);

    // OSC 133 exit-code gutter dots: each prompt gets a dot colored by the
    // previous command's exit code (when a shell emits FTCS marks).
    const detachShellIntegration = attachShellIntegrationDecorations(terminal, {
      colorForExit: (code) =>
        code === undefined || code === 0
          ? 'var(--terminal-status-ok)'
          : 'var(--terminal-status-fail)',
    });

    // Heartbeat glow driven by live output flow (disabled under reduced motion).
    const encoder = new TextEncoder();
    const heartbeat = createActivityMeter();
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastHeartbeatLevel = -1;
    if (!prefersReducedMotion()) {
      heartbeatTimer = setInterval(() => {
        const level = Math.round(heartbeat.intensity(Date.now()) * 100) / 100;
        if (level !== lastHeartbeatLevel) {
          lastHeartbeatLevel = level;
          element.style.setProperty('--heartbeat', String(level));
        }
      }, 150);
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const notifyPtyResize = () => {
      if (!terminalId) return;
      api.resizeTerminal({
        id: terminalId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    };
    const resize = () => {
      const scrollAnchor = rememberScrollAnchor(
        lastScrollAnchorRef.current,
        captureTerminalViewportAnchor(terminal),
      );
      lastScrollAnchorRef.current = scrollAnchor;
      fitTerminalWithGutter(terminal, element);
      // Fit the local grid immediately, but debounce the PTY SIGWINCH so a zoom
      // or drag gesture doesn't flood the child process with resizes.
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        notifyPtyResize();
      }, TERMINAL_RESIZE_DEBOUNCE_MS);
      queueTerminalViewportScrollRestore(terminal, scrollAnchor);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);

    const disposeData = api.onTerminalData((event) => {
      if (event.id === terminalId) {
        terminalHadOutput = true;
        heartbeat.record(encoder.encode(event.data).length, Date.now());
        const scrollAnchor = rememberScrollAnchor(
          lastScrollAnchorRef.current,
          captureTerminalViewportAnchor(terminal),
        );
        lastScrollAnchorRef.current = scrollAnchor;
        terminal.write(event.data, () => {
          if (shouldRestoreAfterTerminalWrite(scrollAnchor)) {
            queueTerminalViewportScrollRestore(terminal, scrollAnchor);
          }
          if (replayScrollAnchorRef.current !== null) {
            queueTerminalViewportScrollRestore(
              terminal,
              replayScrollAnchorRef.current,
            );
            replayScrollAnchorRef.current = null;
          }
        });
      }
    });
    const disposeExit = api.onTerminalExit((event) => {
      if (event.id === terminalId) {
        terminal.writeln(
          `\r\n${terminalEarlyExitNotice({
            exitCode: event.exitCode,
            hadOutput: terminalHadOutput,
          })}`,
        );
        terminalId = undefined;
        onTerminalExitRef.current();
      }
    });
    const disposeLaunchFailed = api.onTerminalLaunchFailed((event) => {
      if (event.id === terminalId) {
        // A binary that failed to launch under ConPTY surfaces here, not as a
        // spawn throw — promote it to the install-hint panel.
        setSpawnFailure(event.error);
      }
    });
    const dataSubscription = terminal.onData((data) => {
      if (terminalId) api.writeTerminal({ id: terminalId, data });
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resize();
        replayScrollAnchorRef.current = rememberScrollAnchor(
          lastScrollAnchorRef.current,
          captureTerminalViewportAnchor(terminal),
        );
        lastScrollAnchorRef.current = replayScrollAnchorRef.current;
        void api
          .spawnTerminal({
            cols: terminal.cols,
            rows: terminal.rows,
            cardId: cardIdRef.current,
          })
          .then((response) => {
            if (disposed) {
              // A keyed session survives this (StrictMode) unmount for the next
              // mount to reattach; the reaper kills it if the card is truly gone.
              // Only an unkeyed one-off must be killed here to avoid a leak.
              if (response.ok && !cardIdRef.current) {
                api.killTerminal({ id: response.id });
              }
              return;
            }
            if (!response.ok) {
              setSpawnFailure(response.error);
              onTerminalReadyRef.current(response);
              return;
            }
            terminalId = response.id;
            onTerminalReadyRef.current(response);
            if (response.reattached) {
              // Reattached to a surviving session — ask main to replay its
              // recorded screen, then live output resumes.
              api.replayTerminal({ id: response.id });
            } else {
              const launchNotice = terminalLaunchNotice(response);
              if (launchNotice) terminal.writeln(`\r\n${launchNotice}`);
            }
            notifyPtyResize();
          })
          .catch((error: unknown) => {
            if (disposed) return;
            // The IPC call itself rejected (transport / handler threw) — this is
            // not a missing binary, so don't render install instructions.
            setSpawnFailure({
              kind: 'spawn-ipc-failed',
              command: '',
              message: error instanceof Error ? error.message : String(error),
            });
            onTerminalReadyRef.current(null);
          });
      });
    });

    return () => {
      disposed = true;
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
      heartbeat.reset();
      element.style.removeProperty('--heartbeat');
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      detachShellIntegration();
      detachPointerFix();
      detachClipboard();
      resizeObserver.disconnect();
      disposeData();
      disposeExit();
      disposeLaunchFailed();
      dataSubscription.dispose();
      replayScrollAnchorRef.current = null;
      if (terminalId) {
        // Detach (keep the process alive) for keyed cards so a remount can
        // reattach; the deck reaper kills it once the card is gone.
        if (cardIdRef.current) {
          api.detachTerminal({ id: terminalId });
        } else {
          api.killTerminal({ id: terminalId });
        }
      }
      onTerminalReadyRef.current(null);
      terminal.dispose();
    };
  }, [retryNonce]);

  return (
    <div className="terminal-host-container">
      <div className="terminal-host" ref={elementRef} />
      {spawnFailure ? (
        <TerminalInstallHintPanel
          error={spawnFailure}
          onRetry={() => {
            setSpawnFailure(null);
            setRetryNonce((nonce) => nonce + 1);
          }}
          onOpenExternal={(url) => {
            void kickbacksApi().openExternal({ url });
          }}
        />
      ) : null}
    </div>
  );
}

function settingsIcon(section: SettingsSectionId) {
  if (section === 'account') return <User size={15} />;
  if (section === 'address') return <ShieldCheck size={15} />;
  if (section === 'payout') return <WalletCards size={15} />;
  if (section === 'terminal') return <SquareTerminal size={15} />;
  return <ShieldCheck size={15} />;
}

function cardAccent(kind: KickbacksCard['kind']): string {
  if (kind === 'terminal') return 'oklch(0.77 0.106 256)';
  if (kind === 'sponsor') return 'oklch(0.68 0.15 154)';
  return 'oklch(0.76 0.12 82)';
}

function isInteractiveTarget(target: EventTarget): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest(
        '.canvas-card, button, input, textarea, select, .xterm, .xterm-helper-textarea',
      ),
  );
}

function clampScale(value: number): number {
  return Math.max(0.55, Math.min(1.6, value));
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
}

function shortId(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function eventLabel(event: SafeAdEvent): string {
  return event.kind === 'ad.impression' ? '5 Sec Ad' : 'Click';
}

function eventCreditUsd(event: SafeAdEvent): number {
  return Number.isFinite(event.creditUsd) ? event.creditUsd : 0;
}

function countFiveSecondAdsLastHour(
  events: SafeAdEvent[],
  now = Date.now(),
): number {
  const windowStart = now - 60 * 60 * 1_000;
  return events.filter((event) => {
    if (event.kind !== 'ad.impression') return false;
    if (event.renderedMs < FIVE_SECOND_AD_RENDERED_MS) return false;
    return Date.parse(event.at) >= windowStart;
  }).length;
}

function formatCredit(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
    style: 'currency',
  }).format(value);
}

function formatLedgerTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'none';
  if (ageMs < 1_000) return `${ageMs}ms`;
  return `${(ageMs / 1_000).toFixed(1)}s`;
}

function activityStateLabel(status: EarningStatusResponse | null): string {
  if (!status) return 'starting';
  if (status.structuredActivityActive === true) return 'thinking';
  if (status.structuredActivityActive === false) return 'idle';
  return status.payable ? 'thinking' : 'waiting';
}

function formatThinkingTime(status: EarningStatusResponse | null): string {
  const duration =
    status?.currentThinkingDurationMs ?? status?.lastThinkingDurationMs ?? null;
  return formatAge(duration);
}

function verificationSourceLabel(
  source: EarningStatusResponse['verificationSource'] | null | undefined,
): string {
  if (!source) return 'none';
  if (source === 'codex-app-server') return 'Kickbacks server';
  if (source === 'terminal-parser') return 'Terminal parser';
  return source;
}

function confidenceLabel(level: TrustDebugSnapshot['summary']['level']): string {
  if (level === 'low') return 'strong';
  if (level === 'medium') return 'warming up';
  return 'review';
}

function trustReasonLabel(
  reason: TrustDebugSnapshot['summary']['reasons'][number],
): string {
  if (reason === 'visible-ad') return 'ad window visible';
  if (reason === 'focused-window') return 'ad window focused';
  if (reason === 'app-not-focused') return 'ad window not focused';
  if (reason === 'recent-human-input') return 'recent human input';
  if (reason === 'ad-window-not-active') return 'no active ad window';
  if (reason === 'long-idle-while-earning') return 'long idle stretch';
  if (reason === 'continuous-session') return 'long continuous session';
  if (reason === 'high-ad-volume') return 'higher ad volume';
  if (reason === 'synthetic-input') return 'synthetic input signal';
  if (reason === 'periodic-input-pattern') return 'very regular input timing';
  if (reason === 'low-pointer-jitter') return 'very straight pointer movement';
  return 'limited human input';
}

function formatDebugDuration(valueMs: number): string {
  const seconds = valueMs / 1_000;
  if (seconds < 5) return '<5s';
  if (seconds < 10) return '5-10s';
  if (seconds < 30) return '10-30s';
  if (seconds < 60) return '30-60s';
  const minutes = seconds / 60;
  if (minutes < 5) return '1-5m';
  if (minutes < 30) return '5-30m';
  if (minutes < 60) return '30-60m';
  return '1h+';
}
