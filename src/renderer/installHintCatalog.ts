export interface InstallHint {
  command: string;
  title: string;
  detail: string;
  url?: string;
}

/**
 * Install hints for the CLIs kickbacks can launch. Best-effort: package names
 * match the vendors' published instructions (@openai/codex,
 * @anthropic-ai/claude-code); Cursor recommends its install script at
 * cursor.com/install. Re-verify against the CLIs' docs when bumping.
 *
 * Keyed by the lower-cased command basename (extension stripped). Codex is the
 * primary CLI kickbacks spawns: it resolves codex.exe from PATH on Windows and
 * honors CODEX_CLI_PATH (see src/shared/codexExecutable.ts), so the hint points
 * at the npm global install the resolver expects to find.
 */
const HINTS: Record<string, Omit<InstallHint, 'command'>> = {
  codex: {
    title: 'Codex CLI',
    detail:
      'Install the Codex CLI with `npm install -g @openai/codex`, then reopen the terminal. If it is installed elsewhere, set CODEX_CLI_PATH to its full path.',
    url: 'https://www.npmjs.com/package/@openai/codex',
  },
  claude: {
    title: 'Claude Code CLI',
    detail:
      'Install the Claude Code CLI with `npm install -g @anthropic-ai/claude-code`, then reopen the terminal.',
    url: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
  },
  agent: {
    title: 'Cursor Agent CLI',
    detail:
      'Install the Cursor Agent CLI with `curl https://cursor.com/install -fsS | bash`, then reopen the terminal.',
    url: 'https://cursor.com/install',
  },
  'cursor-agent': {
    title: 'Cursor Agent CLI',
    detail:
      'Install the Cursor Agent CLI with `curl https://cursor.com/install -fsS | bash`, then reopen the terminal.',
    url: 'https://cursor.com/install',
  },
  opencode: {
    title: 'OpenCode CLI',
    detail:
      'Install the OpenCode CLI with `npm install -g opencode-ai`, then reopen the terminal.',
    url: 'https://www.npmjs.com/package/opencode-ai',
  },
};

/**
 * Map a missing CLI command to a friendly install hint. The lookup is by
 * basename (path segments stripped) and case-insensitive, with common Windows
 * executable extensions removed, so `C:\\Tools\\Codex.EXE`, `codex`, and
 * `/usr/local/bin/codex` all resolve to the same entry. Unknown commands get a
 * generic fallback so callers can always render something actionable.
 */
export function installHintForCommand(command: string): InstallHint {
  const basename = commandBasename(command);
  const known = HINTS[basename];
  if (known) {
    return { command: basename, ...known };
  }
  const label = basename || command.trim() || 'the command';
  return {
    command: label,
    title: `${label} not found`,
    detail: `Could not find ${label} on PATH. Install it (or add it to your PATH) and reopen the terminal.`,
  };
}

function commandBasename(command: string): string {
  return (
    command
      .trim()
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase()
      .replace(/\.(exe|cmd|bat|com)$/, '') ?? ''
  );
}
