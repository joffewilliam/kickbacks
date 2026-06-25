import { describe, expect, it } from 'vitest';
import type { KickbacksCard } from '../shared/workspaceModel';
import {
  defaultTerminalLaunchModes,
  defaultTerminalSessions,
  nextLiveTerminalCardId,
  nextPrimaryTerminalCardId,
  removeTerminalLaunchMode,
  removeTerminalSession,
  retainTerminalLaunchModesForCards,
  retainTerminalSessionsForCards,
  terminalCardIdForSession,
  terminalLaunchModeLabel,
  updateKnownTerminalSession,
  updateTerminalLaunchMode,
} from './terminalSessionState';

const cards: KickbacksCard[] = [
  {
    id: 'terminal-card',
    kind: 'terminal',
    title: 'Terminal',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 1,
  },
  {
    id: 'terminal-card-2',
    kind: 'terminal',
    title: 'Terminal 2',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 3,
  },
  {
    id: 'sponsor-card',
    kind: 'sponsor',
    title: 'Sponsor',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    zIndex: 2,
  },
];

describe('terminal session state', () => {
  it('ignores ready callbacks for removed terminal cards', () => {
    const sessions = { 'terminal-card': 'pty-1' };

    expect(
      updateKnownTerminalSession({
        cardId: 'terminal-card-2',
        knownCardIds: new Set(['terminal-card']),
        sessions,
        terminalId: null,
      }),
    ).toBe(sessions);
  });

  it('updates sessions for known terminal cards', () => {
    expect(
      updateKnownTerminalSession({
        cardId: 'terminal-card',
        knownCardIds: new Set(['terminal-card']),
        sessions: { 'terminal-card': null },
        terminalId: 'pty-1',
      }),
    ).toEqual({ 'terminal-card': 'pty-1' });
  });

  it('removes a closed terminal session without disturbing others', () => {
    expect(
      removeTerminalSession({
        'terminal-card': 'pty-1',
        'terminal-card-2': 'pty-2',
      }, 'terminal-card-2'),
    ).toEqual({ 'terminal-card': 'pty-1' });
  });

  it('chooses the highest visible terminal as next primary after close', () => {
    expect(nextPrimaryTerminalCardId(cards, 'terminal-card-2')).toBe(
      'terminal-card',
    );
  });

  it('chooses the highest live terminal as next primary after exit', () => {
    expect(
      nextLiveTerminalCardId({
        cards,
        excludingCardId: 'terminal-card-2',
        sessions: {
          'terminal-card': 'pty-1',
          'terminal-card-2': null,
        },
      }),
    ).toBe('terminal-card');
    expect(
      nextLiveTerminalCardId({
        cards,
        excludingCardId: 'terminal-card',
        sessions: {
          'terminal-card': null,
          'terminal-card-2': null,
        },
      }),
    ).toBeNull();
  });

  it('resets to the default terminal session shape', () => {
    expect(defaultTerminalSessions()).toEqual({ 'terminal-card': null });
  });

  it('resets to the default terminal launch mode shape', () => {
    expect(defaultTerminalLaunchModes()).toEqual({ 'terminal-card': null });
  });

  it('preserves live sessions for terminal cards that survive a reset', () => {
    expect(
      retainTerminalSessionsForCards({
        cardIds: new Set(['terminal-card']),
        sessions: {
          'terminal-card': 'pty-1',
          'terminal-card-2': 'pty-2',
        },
      }),
    ).toEqual({ 'terminal-card': 'pty-1' });
  });

  it('creates null placeholders for retained terminal cards without sessions', () => {
    expect(
      retainTerminalSessionsForCards({
        cardIds: new Set(['terminal-card']),
        sessions: {},
      }),
    ).toEqual({ 'terminal-card': null });
  });

  it('tracks terminal launch modes for known cards only', () => {
    const modes = { 'terminal-card': null };

    expect(
      updateTerminalLaunchMode({
        cardId: 'terminal-card',
        knownCardIds: new Set(['terminal-card']),
        launchMode: 'codex-app-server',
        modes,
      }),
    ).toEqual({ 'terminal-card': 'codex-app-server' });
    expect(
      updateTerminalLaunchMode({
        cardId: 'terminal-card-2',
        knownCardIds: new Set(['terminal-card']),
        launchMode: 'shell',
        modes,
      }),
    ).toBe(modes);
  });

  it('removes and retains launch modes alongside terminal cards', () => {
    expect(
      removeTerminalLaunchMode({
        'terminal-card': 'codex-app-server',
        'terminal-card-2': 'shell',
      }, 'terminal-card-2'),
    ).toEqual({ 'terminal-card': 'codex-app-server' });

    expect(
      retainTerminalLaunchModesForCards({
        cardIds: new Set(['terminal-card']),
        modes: {
          'terminal-card': 'codex-app-server',
          'terminal-card-2': 'shell',
        },
        sessions: {
          'terminal-card': 'pty-1',
          'terminal-card-2': 'pty-2',
        },
      }),
    ).toEqual({ 'terminal-card': 'codex-app-server' });
  });

  it('drops exited launch status when reset retains a card without a live PTY', () => {
    expect(
      retainTerminalLaunchModesForCards({
        cardIds: new Set(['terminal-card']),
        modes: {
          'terminal-card': 'exited',
        },
        sessions: {
          'terminal-card': null,
        },
      }),
    ).toEqual({ 'terminal-card': null });
  });

  it('labels terminal launch modes for card headers', () => {
    expect(terminalLaunchModeLabel('codex-app-server')).toBe('Codex');
    expect(terminalLaunchModeLabel('shell')).toBe('Shell fallback');
    expect(terminalLaunchModeLabel('exited')).toBe('Exited');
    expect(terminalLaunchModeLabel(null)).toBe('Starting');
  });

  it('finds the terminal card that owns a live PTY id', () => {
    expect(
      terminalCardIdForSession(
        {
          'terminal-card': 'pty-1',
          'terminal-card-2': 'pty-2',
        },
        'pty-2',
      ),
    ).toBe('terminal-card-2');
    expect(terminalCardIdForSession({ 'terminal-card': null }, 'pty-1')).toBeNull();
  });
});
