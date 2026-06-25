import { describe, expect, it } from 'vitest';
import { normalizedBoardScale } from './terminalBoardPointer';

describe('normalizedBoardScale', () => {
  it('falls back to unity for invalid values', () => {
    expect(normalizedBoardScale(Number.NaN)).toBe(1);
    expect(normalizedBoardScale(0)).toBe(1);
    expect(normalizedBoardScale(1.25)).toBe(1.25);
  });
});
