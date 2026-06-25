import fs from 'node:fs';
import path from 'node:path';

/**
 * Standalone PATH x PATHEXT executable resolver.
 *
 * Ported from upstream's `resolveExecutableCommand` in
 * src/main/pty/shellResolver.ts. Duplicated here (rather than imported) so the
 * lookup can be reused without creating a dependency cycle on the shell
 * cascade. The behavior is the same: scan each PATH directory, trying the bare
 * name plus each PATHEXT extension when the name has no extension of its own,
 * and return the first absolute path that exists.
 */

/** Injectable file-existence probe so the lookup is unit-testable. */
export type FileExists = (filePath: string) => boolean;

/** Default probe: true only when the path resolves to an existing file. */
export function defaultFileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
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

/** Case-insensitive lookup of an env key (e.g. `Path` vs `PATH`). */
function lookupEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const direct = env[key];
  if (direct !== undefined) return direct;
  const lowerKey = key.toLowerCase();
  for (const envKey of Object.keys(env)) {
    if (envKey.toLowerCase() === lowerKey) return env[envKey];
  }
  return undefined;
}

/** Resolve the path implementation for the *requested* platform, not the host. */
function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function pathEntries(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const raw = lookupEnv(env, 'PATH') ?? '';
  return raw.split(pathFor(platform).delimiter).filter((entry) => entry.length > 0);
}

function pathExtensions(env: NodeJS.ProcessEnv): string[] {
  const raw = lookupEnv(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD';
  return raw.split(';').filter((ext) => ext.length > 0);
}

/**
 * Resolve `command` to an absolute executable path.
 *
 * - If `command` is already an absolute path, it is returned when it exists.
 * - On win32 the name is expanded across PATHEXT when it has no extension;
 *   elsewhere the bare name is used as-is.
 * - Scans each PATH directory in order and returns the first hit.
 * - Returns `undefined` on a true miss (a meaningful not-found signal).
 */
export function findExecutableCommand(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  fileExists: FileExists = defaultFileExists,
): string | undefined {
  const p = pathFor(platform);
  if (p.isAbsolute(command)) {
    return existingFile(command, fileExists) ? command : undefined;
  }

  const candidates =
    platform === 'win32' && !p.extname(command)
      ? pathExtensions(env).map((ext) => `${command}${ext}`)
      : [command];

  for (const dir of pathEntries(env, platform)) {
    for (const candidate of candidates) {
      const full = p.join(dir, candidate);
      if (existingFile(full, fileExists)) return full;
    }
  }

  return undefined;
}
