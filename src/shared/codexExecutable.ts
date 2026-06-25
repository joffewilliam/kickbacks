export interface ResolveCodexExecutableInput {
  env: Record<string, string | undefined>;
  exists: (candidate: string) => boolean;
  platform: string;
}

export function resolveCodexExecutable({
  env,
  exists,
  platform,
}: ResolveCodexExecutableInput): string {
  const explicitPath = env.CODEX_CLI_PATH?.trim();
  if (explicitPath && exists(stripQuotes(explicitPath))) {
    return stripQuotes(explicitPath);
  }

  if (platform !== 'win32') return 'codex';

  const pathValue = env.Path ?? env.PATH ?? '';
  for (const entry of pathValue.split(';')) {
    const directory = stripQuotes(entry.trim());
    if (!directory) continue;
    const candidate = `${trimTrailingSlashes(directory)}\\codex.exe`;
    if (exists(candidate)) return candidate;
  }

  return 'codex';
}

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/[\\/]+$/g, '');
}
