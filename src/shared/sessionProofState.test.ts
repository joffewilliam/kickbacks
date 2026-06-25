import { describe, expect, it } from 'vitest';
import { sessionProofState } from './sessionProofState';

describe('sessionProofState', () => {
  it('marks a session creditable when detector and local ad proof are both ready', () => {
    expect(
      sessionProofState({
        activeTerminalId: 'terminal-1',
        earningEligible: true,
        detectorPayable: true,
        localAdWindowCreditable: true,
        hourlyAdCapReached: false,
        waitingAdVisible: true,
      }),
    ).toEqual({
      label: 'Ready to credit',
      reason: 'creditable',
      tone: 'success',
    });
  });

  it('waits for model activity before crediting ads', () => {
    expect(
      sessionProofState({
        activeTerminalId: 'terminal-1',
        earningEligible: true,
        detectorPayable: false,
        localAdWindowCreditable: true,
        hourlyAdCapReached: false,
        waitingAdVisible: true,
      }).reason,
    ).toBe('model-not-payable');
  });

  it('waits for focused visible ad time before crediting', () => {
    expect(
      sessionProofState({
        activeTerminalId: 'terminal-1',
        earningEligible: true,
        detectorPayable: true,
        localAdWindowCreditable: false,
        hourlyAdCapReached: false,
        waitingAdVisible: true,
      }),
    ).toEqual({
      label: 'Waiting for 5 focused visible seconds',
      reason: 'ad-proof-pending',
      tone: 'warning',
    });
  });

  it('shows capped before ready once the hourly ad cap is reached', () => {
    expect(
      sessionProofState({
        activeTerminalId: 'terminal-1',
        earningEligible: true,
        detectorPayable: true,
        localAdWindowCreditable: true,
        hourlyAdCapReached: true,
        waitingAdVisible: true,
      }).reason,
    ).toBe('hourly-cap');
  });
});
