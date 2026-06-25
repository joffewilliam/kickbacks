/** Default-shell choice for plain shell cards. */
export type TerminalShellChoice =
  | 'auto'
  | 'pwsh'
  | 'powershell'
  | 'cmd'
  | { customPath: string };

export interface TerminalSettings {
  schemaVersion: 1;
  /** 'auto' follows the pwsh -> powershell -> cmd cascade. */
  defaultShell: TerminalShellChoice;
  /** Use the conpty.dll bundled with node-pty instead of the OS one (win32). */
  useConptyDll: boolean;
  /** Dot-source the OSC 133 shell integration script into PowerShell cards. */
  shellIntegration: boolean;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  schemaVersion: 1,
  defaultShell: 'auto',
  useConptyDll: false,
  shellIntegration: true,
};

export const NAMED_SHELL_CHOICES = new Set<TerminalShellChoice>([
  'auto',
  'pwsh',
  'powershell',
  'cmd',
]);

export function shellChoiceFromUnknown(value: unknown): TerminalShellChoice {
  if (
    typeof value === 'string' &&
    NAMED_SHELL_CHOICES.has(value as TerminalShellChoice)
  ) {
    return value as TerminalShellChoice;
  }
  if (value && typeof value === 'object') {
    const customPath = (value as { customPath?: unknown }).customPath;
    if (typeof customPath === 'string' && customPath.trim()) {
      return { customPath: customPath.trim() };
    }
  }
  return DEFAULT_TERMINAL_SETTINGS.defaultShell;
}

export function booleanFromUnknown(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function terminalSettingsFromJson(value: unknown): TerminalSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_TERMINAL_SETTINGS };
  }
  const source = value as Record<string, unknown>;
  return {
    schemaVersion: 1,
    defaultShell: shellChoiceFromUnknown(source.defaultShell),
    useConptyDll: booleanFromUnknown(
      source.useConptyDll,
      DEFAULT_TERMINAL_SETTINGS.useConptyDll,
    ),
    shellIntegration: booleanFromUnknown(
      source.shellIntegration,
      DEFAULT_TERMINAL_SETTINGS.shellIntegration,
    ),
  };
}

export function terminalSettingsToJson(
  settings: TerminalSettings,
): TerminalSettings {
  const normalized = terminalSettingsFromJson(settings);
  return {
    schemaVersion: normalized.schemaVersion,
    defaultShell: normalized.defaultShell,
    useConptyDll: normalized.useConptyDll,
    shellIntegration: normalized.shellIntegration,
  };
}
