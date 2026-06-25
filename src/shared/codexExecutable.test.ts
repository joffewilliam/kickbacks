import { describe, expect, it } from 'vitest';
import { resolveCodexExecutable } from './codexExecutable';

describe('Codex executable resolution', () => {
  it('resolves codex.exe from PATH on Windows for node-pty', () => {
    const result = resolveCodexExecutable({
      env: {
        Path: [
          'C:\\Windows\\System32',
          'C:\\Users\\dragg\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin',
        ].join(';'),
      },
      exists: (candidate) =>
        candidate ===
        'C:\\Users\\dragg\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
      platform: 'win32',
    });

    expect(result).toBe(
      'C:\\Users\\dragg\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
    );
  });

  it('uses an explicit CODEX_CLI_PATH when it points to an existing file', () => {
    const result = resolveCodexExecutable({
      env: {
        CODEX_CLI_PATH: 'D:\\Tools\\codex.exe',
        Path: 'C:\\Windows\\System32',
      },
      exists: (candidate) => candidate === 'D:\\Tools\\codex.exe',
      platform: 'win32',
    });

    expect(result).toBe('D:\\Tools\\codex.exe');
  });

  it('keeps PATH lookup behavior on non-Windows platforms', () => {
    expect(
      resolveCodexExecutable({
        env: {},
        exists: () => false,
        platform: 'linux',
      }),
    ).toBe('codex');
  });
});
