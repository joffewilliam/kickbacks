import type { KickbacksRect } from '../shared/workspaceModel';

export type CardRectWriteMode = 'full' | 'position';

export function writeCardRectStyle(
  element: HTMLElement,
  rect: KickbacksRect,
  mode: CardRectWriteMode,
): void {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  if (mode === 'position') return;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}
