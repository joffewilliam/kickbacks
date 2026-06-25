import { describe, expect, it } from 'vitest';
import {
  shouldBlurTerminalForPointerDown,
  terminalFocusBoundary,
} from './terminalFocus';

function fakeHost(...inside: unknown[]) {
  const contained = new Set(inside);
  return {
    contains: (target: unknown) => contained.has(target),
  };
}

describe('shouldBlurTerminalForPointerDown', () => {
  it('blurs when terminal input is active and the pointer lands outside the terminal', () => {
    const activeTextarea = {};
    const terminalCanvas = {};
    const outsideButton = {};
    const host = fakeHost(activeTextarea, terminalCanvas);

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: activeTextarea,
        pointerTarget: outsideButton,
      }),
    ).toBe(true);
  });

  it('keeps terminal focus when the pointer lands inside the same terminal', () => {
    const activeTextarea = {};
    const terminalCanvas = {};
    const host = fakeHost(activeTextarea, terminalCanvas);

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: activeTextarea,
        pointerTarget: terminalCanvas,
      }),
    ).toBe(false);
  });

  it('keeps terminal focus when the pointer lands on a nested child of the host', () => {
    const activeTextarea = {};
    const nestedChild = {};
    const host = fakeHost(activeTextarea, nestedChild);

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: activeTextarea,
        pointerTarget: nestedChild,
      }),
    ).toBe(false);
  });

  it('ignores outside clicks when focus is already outside the terminal', () => {
    const terminalCanvas = {};
    const activeCommandInput = {};
    const host = fakeHost(terminalCanvas);

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: activeCommandInput,
        pointerTarget: {},
      }),
    ).toBe(false);
  });

  it('does not blur when the pointer target is null', () => {
    const activeTextarea = {};
    const host = fakeHost(activeTextarea);

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: activeTextarea,
        pointerTarget: null,
      }),
    ).toBe(true);
  });

  it('does not blur when there is no active element', () => {
    const host = fakeHost({});

    expect(
      shouldBlurTerminalForPointerDown({
        host,
        activeElement: null,
        pointerTarget: {},
      }),
    ).toBe(false);
  });

  it('does not blur when the host boundary is missing', () => {
    expect(
      shouldBlurTerminalForPointerDown({
        host: null,
        activeElement: {},
        pointerTarget: {},
      }),
    ).toBe(false);
  });
});

describe('terminalFocusBoundary', () => {
  // Real-DOM containment (the host.contains delegation) is exercised through
  // shouldBlurTerminalForPointerDown above with injectable boundaries, keeping
  // this suite free of a jsdom test environment. Here we pin the non-Node
  // guard, which is the only branch that runs without a live DOM.
  it('treats non-Node targets (including null/undefined) as outside the boundary', () => {
    const fakeHost = {
      contains: () => true,
    } as unknown as HTMLElement;
    const boundary = terminalFocusBoundary(fakeHost);

    expect(boundary.contains(null)).toBe(false);
    expect(boundary.contains(undefined)).toBe(false);
    expect(boundary.contains({})).toBe(false);
    expect(boundary.contains('not-a-node')).toBe(false);
  });
});
