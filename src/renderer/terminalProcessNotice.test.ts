import { describe, expect, it } from 'vitest';
import {
  terminalEarlyExitNotice,
  terminalLaunchNotice,
  terminalSpawnFailureNotice,
} from './terminalProcessNotice';

describe('terminal process notices', () => {
  it('explains spawn failures instead of leaving an empty terminal', () => {
    expect(terminalSpawnFailureNotice(new Error('ENOENT codex.exe'))).toContain(
      'Terminal failed to start',
    );
    expect(terminalSpawnFailureNotice(new Error('ENOENT codex.exe'))).toContain(
      'ENOENT codex.exe',
    );
  });

  it('adds actionable context when a process exits before producing output', () => {
    expect(terminalEarlyExitNotice({ exitCode: 1, hadOutput: false })).toContain(
      'exited before producing terminal output',
    );
  });

  it('keeps normal process exits compact after output was seen', () => {
    expect(terminalEarlyExitNotice({ exitCode: 0, hadOutput: true })).toBe(
      '[process exited: 0]',
    );
  });

  it('shows a notice when managed Codex falls back to a shell', () => {
    expect(
      terminalLaunchNotice({
        fallbackReason: 'Kickbacks server unavailable; opened shell fallback.',
        launchMode: 'shell',
      }),
    ).toContain('shell fallback');
    expect(terminalLaunchNotice({ launchMode: 'codex-app-server' })).toBeNull();
  });
});
