import { describe, expect, it } from 'vitest';
import { codexRemoteTerminalArgs } from './codexTerminalLaunch';

describe('Codex terminal launch args', () => {
  it('connects to the app server without alternate screen scrollback', () => {
    expect(codexRemoteTerminalArgs('ws://127.0.0.1:1234')).toEqual([
      '--no-alt-screen',
      '--remote',
      'ws://127.0.0.1:1234',
    ]);
  });
});
