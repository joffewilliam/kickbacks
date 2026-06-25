export interface WaitingAdPlacement {
  cardId: string;
  terminalId: string;
}

export function createWaitingAdPlacement(
  cardId: string | null,
  terminalId: string | null,
): WaitingAdPlacement | null {
  if (!cardId || !terminalId) return null;
  return { cardId, terminalId };
}

export function isWaitingAdVisibleOnCard(
  placement: WaitingAdPlacement | null,
  cardId: string,
): boolean {
  return placement?.cardId === cardId;
}

export function detectorTerminalIdForWaitingAd(
  placement: WaitingAdPlacement | null,
  activeTerminalId: string | null,
): string | null {
  return placement?.terminalId ?? activeTerminalId;
}

export function shouldReplaceWaitingAdPlacement(
  current: WaitingAdPlacement | null,
  next: WaitingAdPlacement,
): boolean {
  return (
    current?.cardId !== next.cardId ||
    current.terminalId !== next.terminalId
  );
}

export function isWaitingAdPlacementCurrent(
  current: WaitingAdPlacement | null,
  scheduled: WaitingAdPlacement,
): boolean {
  return (
    current?.cardId === scheduled.cardId &&
    current.terminalId === scheduled.terminalId
  );
}
