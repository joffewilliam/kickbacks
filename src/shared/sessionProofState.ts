export type SessionProofReason =
  | 'creditable'
  | 'signed-out-or-disabled'
  | 'terminal-not-ready'
  | 'ad-not-visible'
  | 'model-not-payable'
  | 'ad-proof-pending'
  | 'hourly-cap';

export type SessionProofTone = 'success' | 'warning' | 'muted';

export interface SessionProofInput {
  activeTerminalId: string | null;
  detectorPayable: boolean;
  earningEligible: boolean;
  hourlyAdCapReached: boolean;
  localAdWindowCreditable: boolean;
  waitingAdVisible: boolean;
}

export interface SessionProofState {
  label: string;
  reason: SessionProofReason;
  tone: SessionProofTone;
}

export function sessionProofState(input: SessionProofInput): SessionProofState {
  if (!input.earningEligible) {
    return {
      label: 'Earning mode is not active',
      reason: 'signed-out-or-disabled',
      tone: 'muted',
    };
  }
  if (!input.activeTerminalId) {
    return {
      label: 'Terminal session is still starting',
      reason: 'terminal-not-ready',
      tone: 'warning',
    };
  }
  if (!input.waitingAdVisible) {
    return {
      label: 'No active ad window',
      reason: 'ad-not-visible',
      tone: 'muted',
    };
  }
  if (input.hourlyAdCapReached) {
    return {
      label: 'Hourly 5 second ad cap reached',
      reason: 'hourly-cap',
      tone: 'warning',
    };
  }
  if (!input.detectorPayable) {
    return {
      label: 'Waiting for verified model activity',
      reason: 'model-not-payable',
      tone: 'warning',
    };
  }
  if (!input.localAdWindowCreditable) {
    return {
      label: 'Waiting for 5 focused visible seconds',
      reason: 'ad-proof-pending',
      tone: 'warning',
    };
  }
  return {
    label: 'Ready to credit',
    reason: 'creditable',
    tone: 'success',
  };
}
