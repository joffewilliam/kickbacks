import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  DEFAULT_TERMINAL_SETTINGS,
  terminalSettingsFromJson,
  terminalSettingsToJson,
  type TerminalSettings,
} from '../shared/terminalSettings';

export interface TerminalSettingsStoreOptions {
  /** Override the userData root for testing. Defaults to Electron's userData. */
  userDataPath?: string;
}

function settingsFilePath(options: TerminalSettingsStoreOptions): string {
  const root = options.userDataPath ?? app.getPath('userData');
  return path.join(root, 'terminal_settings.json');
}

/**
 * Load persisted terminal settings, tolerating a missing or corrupt file by
 * returning the canonical defaults. Mirrors upstream's corruption-safe
 * terminalSettingsStore.
 */
export async function loadTerminalSettings(
  options: TerminalSettingsStoreOptions = {},
): Promise<TerminalSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(options), 'utf8');
    return terminalSettingsFromJson(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TERMINAL_SETTINGS };
  }
}

/**
 * Persist terminal settings after re-normalizing, so the on-disk JSON is always
 * canonical. Returns the normalized value the caller should trust.
 */
export async function saveTerminalSettings(
  input: unknown,
  options: TerminalSettingsStoreOptions = {},
): Promise<TerminalSettings> {
  const normalized = terminalSettingsFromJson(input);
  const file = settingsFilePath(options);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    `${JSON.stringify(terminalSettingsToJson(normalized), null, 2)}\n`,
  );
  return normalized;
}
