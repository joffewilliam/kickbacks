import { describe, expect, it } from 'vitest';
import { installHintForCommand } from './installHintCatalog';

describe('installHintForCommand', () => {
  it('returns a Codex-specific hint for the codex command', () => {
    const hint = installHintForCommand('codex');
    expect(hint.command).toBe('codex');
    expect(hint.title).toBe('Codex CLI');
    expect(hint.detail).toContain('@openai/codex');
    expect(hint.detail).toContain('CODEX_CLI_PATH');
    expect(hint.url).toBe('https://www.npmjs.com/package/@openai/codex');
  });

  it('maps other known CLIs to their vendor install instructions', () => {
    expect(installHintForCommand('claude').detail).toContain(
      '@anthropic-ai/claude-code',
    );
    expect(installHintForCommand('cursor-agent').detail).toContain(
      'cursor.com/install',
    );
    expect(installHintForCommand('opencode').detail).toContain('opencode-ai');
  });

  it('returns a generic fallback mentioning the command for unknown CLIs', () => {
    const hint = installHintForCommand('some-other-tool');
    expect(hint.command).toBe('some-other-tool');
    expect(hint.detail).toContain('Could not find some-other-tool on PATH');
    expect(hint.url).toBeUndefined();
  });

  it('resolves hints by basename for full paths and is case-insensitive', () => {
    expect(installHintForCommand('C:\\Tools\\Codex.EXE').title).toBe(
      'Codex CLI',
    );
    expect(installHintForCommand('/usr/local/bin/codex').title).toBe(
      'Codex CLI',
    );
    expect(installHintForCommand('claude.cmd').title).toBe('Claude Code CLI');
  });
});
