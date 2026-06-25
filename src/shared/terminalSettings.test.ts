import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings,
  terminalSettingsFromJson,
  terminalSettingsToJson,
} from './terminalSettings';

describe('terminalSettingsFromJson', () => {
  it('falls back to defaults for undefined, null, and non-objects', () => {
    expect(terminalSettingsFromJson(undefined)).toEqual(
      DEFAULT_TERMINAL_SETTINGS,
    );
    expect(terminalSettingsFromJson(null)).toEqual(DEFAULT_TERMINAL_SETTINGS);
    expect(terminalSettingsFromJson(42)).toEqual(DEFAULT_TERMINAL_SETTINGS);
    expect(terminalSettingsFromJson('cmd')).toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it('uses defaults for an empty object', () => {
    expect(terminalSettingsFromJson({})).toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it('normalizes an unknown named shell to auto', () => {
    expect(terminalSettingsFromJson({ defaultShell: 'bash' }).defaultShell).toBe(
      'auto',
    );
  });

  it('keeps a recognized named shell choice', () => {
    expect(
      terminalSettingsFromJson({ defaultShell: 'powershell' }).defaultShell,
    ).toBe('powershell');
  });

  it('treats a whitespace-only custom path as auto', () => {
    expect(
      terminalSettingsFromJson({ defaultShell: { customPath: ' ' } })
        .defaultShell,
    ).toBe('auto');
  });

  it('preserves and trims a non-empty custom path', () => {
    expect(
      terminalSettingsFromJson({
        defaultShell: { customPath: '  C:/x/pwsh.exe  ' },
      }).defaultShell,
    ).toEqual({ customPath: 'C:/x/pwsh.exe' });
  });

  it('defaults shellIntegration to true when missing', () => {
    expect(terminalSettingsFromJson({ useConptyDll: true }).shellIntegration).toBe(
      true,
    );
  });

  it('defaults useConptyDll to false when missing', () => {
    expect(
      terminalSettingsFromJson({ shellIntegration: false }).useConptyDll,
    ).toBe(false);
  });

  it('respects explicit boolean fields', () => {
    expect(
      terminalSettingsFromJson({
        useConptyDll: true,
        shellIntegration: false,
      }),
    ).toEqual({
      schemaVersion: 1,
      defaultShell: 'auto',
      useConptyDll: true,
      shellIntegration: false,
    });
  });

  it('ignores non-boolean field types and uses per-field defaults', () => {
    expect(
      terminalSettingsFromJson({
        useConptyDll: 'yes',
        shellIntegration: 0,
      }),
    ).toEqual(DEFAULT_TERMINAL_SETTINGS);
  });
});

describe('terminalSettingsToJson', () => {
  it('re-normalizes settings on write', () => {
    const dirty = {
      schemaVersion: 1,
      defaultShell: { customPath: '  C:/x/pwsh.exe  ' },
      useConptyDll: true,
      shellIntegration: false,
    } as unknown as TerminalSettings;
    expect(terminalSettingsToJson(dirty)).toEqual({
      schemaVersion: 1,
      defaultShell: { customPath: 'C:/x/pwsh.exe' },
      useConptyDll: true,
      shellIntegration: false,
    });
  });

  it('round-trips stably through fromJson(toJson(...))', () => {
    const inputs: unknown[] = [
      undefined,
      {},
      { defaultShell: 'cmd' },
      { defaultShell: { customPath: '  C:/x/pwsh.exe  ' } },
      { defaultShell: 'bash', useConptyDll: true },
      { useConptyDll: true, shellIntegration: false },
    ];
    for (const input of inputs) {
      const once = terminalSettingsFromJson(input);
      const twice = terminalSettingsFromJson(terminalSettingsToJson(once));
      expect(twice).toEqual(once);
    }
  });
});
