import { describe, expect, it } from 'vitest';
import { findExecutableCommand, type FileExists } from './executableLookup';

function existsOnly(...paths: string[]): FileExists {
  const set = new Set(paths.map((p) => p.toLowerCase()));
  return (candidate) => set.has(candidate.toLowerCase());
}

describe('findExecutableCommand (win32)', () => {
  it('finds command.exe on PATH via PATHEXT when the name has no extension', () => {
    const env = {
      Path: 'C:\\Tools;C:\\Other',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    };
    expect(
      findExecutableCommand(
        'codex',
        env,
        'win32',
        existsOnly('C:\\Other\\codex.EXE'),
      ),
    ).toBe('C:\\Other\\codex.EXE');
  });

  it('finds an explicit command.exe on PATH', () => {
    const env = { Path: 'C:\\Tools', PATHEXT: '.EXE' };
    expect(
      findExecutableCommand(
        'codex.exe',
        env,
        'win32',
        existsOnly('C:\\Tools\\codex.exe'),
      ),
    ).toBe('C:\\Tools\\codex.exe');
  });

  it('reads the PATH entries under a lowercase `path` key', () => {
    const env = { path: 'C:\\Tools', PATHEXT: '.EXE' };
    expect(
      findExecutableCommand(
        'codex',
        env,
        'win32',
        existsOnly('C:\\Tools\\codex.EXE'),
      ),
    ).toBe('C:\\Tools\\codex.EXE');
  });

  it('returns undefined when nothing on PATH matches', () => {
    const env = { Path: 'C:\\Tools', PATHEXT: '.EXE' };
    expect(findExecutableCommand('codex', env, 'win32', existsOnly())).toBe(
      undefined,
    );
  });

  it('returns an absolute path verbatim when it exists', () => {
    const abs = 'C:\\Custom\\codex.exe';
    expect(
      findExecutableCommand(abs, { Path: 'C:\\Tools' }, 'win32', existsOnly(abs)),
    ).toBe(abs);
  });

  it('returns undefined for an absolute path that does not exist', () => {
    expect(
      findExecutableCommand(
        'C:\\Missing\\codex.exe',
        { Path: 'C:\\Tools' },
        'win32',
        existsOnly(),
      ),
    ).toBe(undefined);
  });

  it('treats filesystem probe errors as not-found', () => {
    const throwing: FileExists = () => {
      throw new Error('EPERM');
    };
    expect(
      findExecutableCommand(
        'codex',
        { Path: 'C:\\Tools', PATHEXT: '.EXE' },
        'win32',
        throwing,
      ),
    ).toBe(undefined);
  });
});

describe('findExecutableCommand (posix)', () => {
  it('finds a bare command on PATH', () => {
    const env = { PATH: '/usr/bin:/usr/local/bin' };
    expect(
      findExecutableCommand(
        'codex',
        env,
        'linux',
        existsOnly('/usr/local/bin/codex'),
      ),
    ).toBe('/usr/local/bin/codex');
  });

  it('does not append PATHEXT extensions off-win32', () => {
    const env = { PATH: '/usr/bin', PATHEXT: '.EXE' };
    expect(
      findExecutableCommand(
        'codex',
        env,
        'darwin',
        existsOnly('/usr/bin/codex.EXE'),
      ),
    ).toBe(undefined);
  });

  it('returns undefined when the command is absent from PATH', () => {
    const env = { PATH: '/usr/bin' };
    expect(findExecutableCommand('codex', env, 'linux', existsOnly())).toBe(
      undefined,
    );
  });

  it('returns an absolute path verbatim when it exists', () => {
    const abs = '/opt/codex/bin/codex';
    expect(
      findExecutableCommand(abs, { PATH: '/usr/bin' }, 'linux', existsOnly(abs)),
    ).toBe(abs);
  });
});
