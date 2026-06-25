import type { Terminal } from '@xterm/xterm';

export function normalizedBoardScale(boardScale: number): number {
  return Number.isFinite(boardScale) && boardScale > 0 ? boardScale : 1;
}

function remapMouseEventForBoardScale(
  event: MouseEvent,
  element: HTMLElement,
  boardScale: number,
): { clientX: number; clientY: number } {
  const scale = normalizedBoardScale(boardScale);
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + (event.clientX - rect.left) / scale,
    clientY: rect.top + (event.clientY - rect.top) / scale,
  };
}

const REMAPPED_MOUSE_EVENT = Symbol('kickbacksTerminalBoardPointerRemap');

function cloneMouseEvent(
  event: MouseEvent,
  element: HTMLElement,
  boardScale: number,
): MouseEvent | null {
  const scale = normalizedBoardScale(boardScale);
  if (Math.abs(scale - 1) < 0.001) return null;
  if (
    (event as MouseEvent & { [REMAPPED_MOUSE_EVENT]?: boolean })[
      REMAPPED_MOUSE_EVENT
    ]
  ) {
    return null;
  }

  const { clientX, clientY } = remapMouseEventForBoardScale(
    event,
    element,
    scale,
  );
  const next = new MouseEvent(event.type, {
    altKey: event.altKey,
    bubbles: event.bubbles,
    button: event.button,
    buttons: event.buttons,
    cancelable: event.cancelable,
    clientX,
    clientY,
    ctrlKey: event.ctrlKey,
    detail: event.detail,
    metaKey: event.metaKey,
    relatedTarget: event.relatedTarget,
    screenX: event.screenX,
    screenY: event.screenY,
    shiftKey: event.shiftKey,
    view: event.view,
  });
  Object.defineProperty(next, REMAPPED_MOUSE_EVENT, {
    value: true,
    enumerable: false,
  });
  return next;
}

/**
 * xterm maps mouse coords using layout cell metrics while getBoundingClientRect
 * reflects the board camera scale. Remap pointer events so selection and the
 * caret track the glyphs without counter-scaling terminal rendering.
 */
export function attachTerminalBoardPointerFix(
  host: HTMLElement,
  terminal: Terminal,
  getBoardScale: () => number,
): () => void {
  const terminalElement = terminal.element;
  const screenElement = terminalElement?.querySelector(
    '.xterm-screen',
  ) as HTMLElement | null;
  if (!terminalElement || !screenElement) {
    return () => undefined;
  }

  let dragActive = false;

  const forward = (source: MouseEvent, target: HTMLElement) => {
    const next = cloneMouseEvent(source, screenElement, getBoardScale());
    if (!next) return false;
    source.stopImmediatePropagation();
    source.preventDefault();
    target.dispatchEvent(next);
    return true;
  };

  const onHostMouse = (event: Event) => {
    const mouse = event as MouseEvent;
    if (!host.contains(mouse.target as Node)) return;

    if (mouse.type === 'mousedown' && mouse.button === 0) {
      dragActive = forward(mouse, terminalElement) || dragActive;
      return;
    }

    if (mouse.type === 'mouseup') {
      const remapped = forward(mouse, terminalElement);
      dragActive = false;
      if (remapped) return;
    }

    if (mouse.type === 'mousemove' || mouse.type === 'dblclick') {
      forward(mouse, terminalElement);
    }
  };

  const onDocumentMouse = (event: Event) => {
    if (!dragActive) return;
    const mouse = event as MouseEvent;
    if (mouse.type === 'mouseup') {
      if (forward(mouse, terminalElement)) {
        dragActive = false;
      }
      return;
    }
    if (mouse.type === 'mousemove') {
      forward(mouse, terminalElement);
    }
  };

  const hostTypes = ['mousedown', 'mousemove', 'mouseup', 'dblclick'] as const;
  for (const type of hostTypes) {
    host.addEventListener(type, onHostMouse, true);
  }
  document.addEventListener('mousemove', onDocumentMouse, true);
  document.addEventListener('mouseup', onDocumentMouse, true);

  return () => {
    for (const type of hostTypes) {
      host.removeEventListener(type, onHostMouse, true);
    }
    document.removeEventListener('mousemove', onDocumentMouse, true);
    document.removeEventListener('mouseup', onDocumentMouse, true);
    dragActive = false;
  };
}
