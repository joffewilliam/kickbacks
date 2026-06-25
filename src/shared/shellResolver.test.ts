import { describe, expect, it } from 'vitest';
import {
  isPowerShell,
  resolveConfiguredShell,
  resolveDefaultShell,
  resolveExecutableCommand,
  shellArgsFor,
  type FileExists,
} from './shellResolver';

function existsOnly(...paths: string[]): FileExists {
  const set = new Set(paths.map((p) => p.toLowerCase()));
  return (candidate) => set.has(candidate.toLowerCase());
}

describe('resolveExecutableCommand', () => {
  it('finds a named executable in a PATH directory', () => {
    const env = {
      Path: 'C:\\Tools;C:\\Other',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    };
    expect(
      resolveExecutableCommand(
        'pwsh.exe',
        env,
        'win32',
        existsOnly('C:\\Other\\pwsh.exe'),
      ),
    ).toBe('C:\\Other\\pwsh.exe');
  });

  it('crosses PATHEXT extensions when the name has none (win32)', () => {
    const env = {
      Path: 'C:\\Tools',
      PATHEXT: '.COM;.EXE',
    };
    expect(
      resolveExecutableCommand(
        'pwsh',
        env,
        'win32',
        existsOnly('C:\\Tools\\pwsh.EXE'),
      ),
    ).toBe('C:\\Tools\\pwsh.EXE');
  });

  it('returns undefined when nothing on PATH matches', () => {
    const env = { Path: 'C:\\Tools', PATHEXT: '.EXE' };
    expect(
      resolveExecutableCommand('pwsh.exe', env, 'win32', existsOnly()),
    ).toBe(undefined);
  });

  it('passes an absolute existing path through verbatim', () => {
    const abs = 'C:\\Tools\\custom\\nu.exe';
    expect(
      resolveExecutableCommand('nu.exe', { Path: '' }, 'win32', existsOnly(abs)),
    ).toBe(undefined);
    expect(
      resolveExecutableCommand(abs, {}, 'win32', existsOnly(abs)),
    ).toBe(abs);
  });

  it('returns undefined for an absolute path that does not exist', () => {
    expect(
      resolveExecutableCommand('/usr/local/bin/fish', {}, 'linux', existsOnly()),
    ).toBe(undefined);
  });
});

describe('resolveDefaultShell (win32 cascade)', () => {
  const PS7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

  it('prefers the PowerShell 7 install dir with -NoLogo', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      Path: 'C:\\Windows\\System32',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    };
    expect(resolveDefaultShell(env, 'win32', existsOnly(PS7))).toEqual({
      command: PS7,
      args: ['-NoLogo'],
    });
  });

  it('respects a custom ProgramFiles location', () => {
    const env = { ProgramFiles: 'D:\\PF' };
    const custom = 'D:\\PF\\PowerShell\\7\\pwsh.exe';
    expect(resolveDefaultShell(env, 'win32', existsOnly(custom))).toEqual({
      command: custom,
      args: ['-NoLogo'],
    });
  });

  it('falls back to pwsh.exe on PATH when the PS7 dir is absent', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      Path: 'C:\\Tools',
      PATHEXT: '.EXE',
    };
    expect(
      resolveDefaultShell(env, 'win32', existsOnly('C:\\Tools\\pwsh.exe')),
    ).toEqual({ command: 'C:\\Tools\\pwsh.exe', args: ['-NoLogo'] });
  });

  it('falls back to powershell.exe on PATH when pwsh is absent', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      Path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
      PATHEXT: '.EXE',
    };
    const winPs =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    expect(resolveDefaultShell(env, 'win32', existsOnly(winPs))).toEqual({
      command: winPs,
      args: ['-NoLogo'],
    });
  });

  it('falls back to COMSPEC with no args when no PowerShell exists', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      Path: 'C:\\Nothing',
      COMSPEC: 'C:\\WINDOWS\\system32\\cmd.exe',
    };
    expect(resolveDefaultShell(env, 'win32', existsOnly())).toEqual({
      command: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: [],
    });
  });

  it('falls back to cmd.exe when even COMSPEC is unset', () => {
    expect(resolveDefaultShell({}, 'win32', existsOnly())).toEqual({
      command: 'cmd.exe',
      args: [],
    });
  });

  it('treats filesystem probe errors as not-found', () => {
    const env = { COMSPEC: 'C:\\WINDOWS\\system32\\cmd.exe' };
    const throwing: FileExists = () => {
      throw new Error('EPERM');
    };
    expect(resolveDefaultShell(env, 'win32', throwing)).toEqual({
      command: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: [],
    });
  });
});

describe('resolveDefaultShell (posix)', () => {
  it('uses SHELL when set, with no args', () => {
    expect(
      resolveDefaultShell({ SHELL: '/bin/zsh' }, 'linux', existsOnly()),
    ).toEqual({ command: '/bin/zsh', args: [] });
  });

  it('falls back to /bin/bash', () => {
    expect(resolveDefaultShell({}, 'darwin', existsOnly())).toEqual({
      command: '/bin/bash',
      args: [],
    });
  });
});

describe('isPowerShell', () => {
  it('matches PowerShell variants by full path, case-insensitively', () => {
    expect(isPowerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe(true);
    expect(
      isPowerShell(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ),
    ).toBe(true);
    expect(isPowerShell('PWSH.EXE')).toBe(true);
    expect(isPowerShell('pwsh')).toBe(true);
    expect(isPowerShell('powershell')).toBe(true);
  });

  it('rejects non-PowerShell shells', () => {
    expect(isPowerShell('C:\\WINDOWS\\system32\\cmd.exe')).toBe(false);
    expect(isPowerShell('/bin/bash')).toBe(false);
    expect(isPowerShell('/bin/zsh')).toBe(false);
  });
});

describe('shellArgsFor', () => {
  it('adds -NoLogo for PowerShell and nothing otherwise', () => {
    expect(shellArgsFor('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toEqual([
      '-NoLogo',
    ]);
    expect(shellArgsFor('cmd.exe')).toEqual([]);
    expect(shellArgsFor('/bin/bash')).toEqual([]);
  });
});

describe('resolveConfiguredShell', () => {
  const PS7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const winEnv = {
    ProgramFiles: 'C:\\Program Files',
    Path: 'C:\\Tools',
    PATHEXT: '.EXE',
    COMSPEC: 'C:\\WINDOWS\\system32\\cmd.exe',
  };

  it('uses a custom path verbatim, with -NoLogo when it is PowerShell', () => {
    expect(
      resolveConfiguredShell({ customPath: 'D:\\sh\\nu.exe' }, winEnv, 'win32', existsOnly()),
    ).toEqual({ command: 'D:\\sh\\nu.exe', args: [] });
    expect(
      resolveConfiguredShell({ customPath: 'D:\\ps\\pwsh.exe' }, winEnv, 'win32', existsOnly()),
    ).toEqual({ command: 'D:\\ps\\pwsh.exe', args: ['-NoLogo'] });
  });

  it("'auto' follows the default cascade", () => {
    expect(resolveConfiguredShell('auto', winEnv, 'win32', existsOnly(PS7))).toEqual({
      command: PS7,
      args: ['-NoLogo'],
    });
  });

  it("'cmd' uses COMSPEC with no args", () => {
    expect(resolveConfiguredShell('cmd', winEnv, 'win32', existsOnly(PS7))).toEqual({
      command: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: [],
    });
  });

  it("'pwsh' resolves pwsh.exe on PATH and falls back to the cascade when absent", () => {
    expect(
      resolveConfiguredShell('pwsh', winEnv, 'win32', existsOnly('C:\\Tools\\pwsh.exe')),
    ).toEqual({ command: 'C:\\Tools\\pwsh.exe', args: ['-NoLogo'] });
    // pwsh absent -> cascade (here only cmd remains)
    expect(resolveConfiguredShell('pwsh', winEnv, 'win32', existsOnly())).toEqual({
      command: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: [],
    });
  });

  it("'powershell' resolves powershell.exe and falls back to the literal name", () => {
    expect(resolveConfiguredShell('powershell', winEnv, 'win32', existsOnly())).toEqual({
      command: 'powershell.exe',
      args: ['-NoLogo'],
    });
  });

  it('ignores named win32 choices on posix and uses the default shell', () => {
    expect(
      resolveConfiguredShell('cmd', { SHELL: '/bin/zsh' }, 'linux', existsOnly()),
    ).toEqual({ command: '/bin/zsh', args: [] });
  });
});
