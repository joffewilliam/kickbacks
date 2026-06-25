import type { EarningStatusResponse } from '../shared/ipc';

export function currentDetectorDebug(
  debug: EarningStatusResponse | null,
  detectorTerminalId: string | null,
): EarningStatusResponse | null {
  if (!debug || !detectorTerminalId) return null;
  return debug.terminalId === detectorTerminalId ? debug : null;
}
