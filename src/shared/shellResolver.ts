import { statSync } from 'node:fs';
import path from 'node:path';
import type { TerminalShellChoice } from './terminalSettings';

/** Injectable file-existence probe so the cascade is unit-testable. */
export type FileExists = (filePath: string) => boolean;

/** Default probe: true only when the path resolves to an existing file. */
export function defaultFileExists(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function existingFile(filePath: string, fileExists: FileExists): boolean {
  try {
    return fileExists(filePath);
  } catch {
    return false;
  }
}

/** Resolve the path implementation for the *requested* platform, not the host. */
function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function pathEntries(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const raw = env.Path ?? env.PATH ?? '';
  return raw.split(pathFor(platform).delimiter).filter((entry) => entry.length > 0);
}

function pathExtensions(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return [];
  const raw = env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  return raw.split(';').filter((ext) => ext.length > 0);
}

/**
 * Resolve a command to an absolute executable path.
 *
 * If the command is already an absolute path that exists, it is returned
 * verbatim. Otherwise PATH is scanned (crossed with PATHEXT on win32 when the
 * name has no extension) for the first existing file. Returns the resolved
 * absolute path, or undefined when nothing matches.
 */
export function resolveExecutableCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fileExists: FileExists = defaultFileExists,
): string | undefined {
  const p = pathFor(platform);
  if (p.isAbsolute(command)) {
    return existingFile(command, fileExists) ? command : undefined;
  }

  const extensions = pathExtensions(env, platform);
  const candidates =
    p.extname(command) || extensions.length === 0
      ? [command]
      : extensions.map((ext) => `${command}${ext}`);

  for (const dir of pathEntries(env, platform)) {
    for (const candidate of candidates) {
      const full = p.join(dir, candidate);
      if (existingFile(full, fileExists)) return full;
    }
  }
  return undefined;
}

const POWERSHELL_BASENAMES = new Set(['pwsh', 'powershell']);

/** True when the shell basename is a PowerShell variant (gets `-NoLogo`). */
export function isPowerShell(shell: string): boolean {
  // Separator- and host-agnostic basename: a resolved command may carry win32
  // backslashes even when this runs under a posix test host.
  const base = (shell.split(/[\\/]/).pop() ?? shell)
    .replace(/\.[^.]*$/, '')
    .toLowerCase();
  return POWERSHELL_BASENAMES.has(base);
}

/** Launch args for a shell: PowerShell variants suppress the startup banner. */
export function shellArgsFor(shell: string): string[] {
  return isPowerShell(shell) ? ['-NoLogo'] : [];
}

export interface ResolvedShell {
  command: string;
  args: string[];
}

/**
 * Default-shell cascade. On Windows: PowerShell 7 install dir, pwsh.exe on
 * PATH, powershell.exe on PATH, then COMSPEC / cmd.exe. PowerShell variants
 * spawn with `-NoLogo`. Elsewhere: SHELL or /bin/bash with no args.
 */
export function resolveDefaultShell(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fileExists: FileExists = defaultFileExists,
): ResolvedShell {
  if (platform !== 'win32') {
    return { command: env.SHELL ?? '/bin/bash', args: [] };
  }

  const ps7 = path.win32.join(
    env.ProgramFiles ?? 'C:\\Program Files',
    'PowerShell',
    '7',
    'pwsh.exe',
  );

  const command =
    (existingFile(ps7, fileExists) ? ps7 : undefined) ??
    resolveExecutableCommand('pwsh.exe', env, platform, fileExists) ??
    resolveExecutableCommand('powershell.exe', env, platform, fileExists) ??
    env.COMSPEC ??
    'cmd.exe';

  return { command, args: shellArgsFor(command) };
}

/**
 * Resolve a user-configured shell choice to a spawnable command. 'auto' (and any
 * non-Windows platform) follows {@link resolveDefaultShell}; a named choice maps
 * to the matching binary (falling back gracefully when absent); an object choice
 * uses its custom path verbatim. PowerShell variants always get `-NoLogo`.
 */
export function resolveConfiguredShell(
  choice: TerminalShellChoice,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  fileExists: FileExists = defaultFileExists,
): ResolvedShell {
  if (typeof choice === 'object' && choice) {
    return { command: choice.customPath, args: shellArgsFor(choice.customPath) };
  }
  if (choice === 'auto' || platform !== 'win32') {
    return resolveDefaultShell(env, platform, fileExists);
  }
  if (choice === 'pwsh') {
    const command =
      resolveExecutableCommand('pwsh.exe', env, platform, fileExists) ??
      resolveDefaultShell(env, platform, fileExists).command;
    return { command, args: shellArgsFor(command) };
  }
  if (choice === 'powershell') {
    const command =
      resolveExecutableCommand('powershell.exe', env, platform, fileExists) ??
      'powershell.exe';
    return { command, args: shellArgsFor(command) };
  }
  if (choice === 'cmd') {
    return { command: env.COMSPEC ?? 'cmd.exe', args: [] };
  }
  return resolveDefaultShell(env, platform, fileExists);
}
