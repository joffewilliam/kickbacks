import { ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import type { PtySpawnLaunchError } from '../shared/ipc';
import { installHintForCommand } from './installHintCatalog';

export function TerminalInstallHintPanel({
  error,
  onRetry,
  onOpenExternal,
}: {
  error: PtySpawnLaunchError;
  onRetry: () => void;
  onOpenExternal: (url: string) => void;
}) {
  // An IPC/transport failure isn't a missing program — don't claim a binary
  // named "terminal" is absent or offer install instructions.
  const hint =
    error.kind === 'spawn-ipc-failed'
      ? {
          command: error.command,
          title: 'Terminal failed to start',
          detail:
            'The terminal could not be launched. Retry, or restart the app if it persists.',
        }
      : installHintForCommand(error.command);
  return (
    <div className="terminal-install-hint" role="alert">
      <div className="terminal-install-hint-card">
        <div className="terminal-install-hint-icon" aria-hidden>
          <TriangleAlert size={20} />
        </div>
        <div className="terminal-install-hint-body">
          <h3>{hint.title}</h3>
          <p>{hint.detail}</p>
          {error.message ? (
            <p className="terminal-install-hint-reason">{error.message}</p>
          ) : null}
          <div className="terminal-install-hint-actions">
            <button
              type="button"
              className="terminal-install-hint-retry"
              onClick={onRetry}
            >
              <RefreshCw size={14} />
              Retry
            </button>
            {hint.url ? (
              <button
                type="button"
                className="terminal-install-hint-link"
                onClick={() => onOpenExternal(hint.url as string)}
              >
                <ExternalLink size={14} />
                Install guide
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
