import { describe, expect, it } from 'vitest';
import type { EarningStatusResponse } from '../shared/ipc';
import { currentDetectorDebug } from './detectorDebugState';

const debug: EarningStatusResponse = {
  checkedAt: 1_000,
  currentThinkingDurationMs: 1_000,
  detectedProvider: 'codex',
  found: true,
  inputBytes: 10,
  label: 'Codex thinking verified',
  lastInputAgeMs: 100,
  lastOutputAgeMs: 100,
  lastThinkingAgeMs: 100,
  lastThinkingDurationMs: null,
  outputBytes: 20,
  payable: true,
  reason: 'active',
  structuredActivityActive: true,
  terminalId: 'terminal-1',
  verificationSource: 'codex-app-server',
};

describe('currentDetectorDebug', () => {
  it('keeps detector debug only for the current detector terminal', () => {
    expect(currentDetectorDebug(debug, 'terminal-1')).toBe(debug);
    expect(currentDetectorDebug(debug, 'terminal-2')).toBeNull();
  });

  it('treats missing detector terminal or debug as loading', () => {
    expect(currentDetectorDebug(debug, null)).toBeNull();
    expect(currentDetectorDebug(null, 'terminal-1')).toBeNull();
  });
});
