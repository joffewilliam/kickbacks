export interface TerminalExitNoticeInput {
  exitCode: number;
  hadOutput: boolean;
}

export interface TerminalLaunchNoticeInput {
  fallbackReason?: string;
  launchMode: 'shell' | 'codex-app-server';
}

export function terminalLaunchNotice({
  fallbackReason,
  launchMode,
}: TerminalLaunchNoticeInput): string | null {
  if (launchMode === 'codex-app-server') return null;
  return fallbackReason ?? 'Opened shell fallback.';
}

export function terminalSpawnFailureNotice(error: unknown): string {
  return [
    'Terminal failed to start.',
    errorMessage(error),
    'Check that Codex is installed and available on PATH, then open a new terminal.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function terminalEarlyExitNotice({
  exitCode,
  hadOutput,
}: TerminalExitNoticeInput): string {
  const compact = `[process exited: ${exitCode}]`;
  if (hadOutput) return compact;
  return `${compact} Process exited before producing terminal output. Check that Codex is installed and launchable, then open a new terminal.`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '';
}
