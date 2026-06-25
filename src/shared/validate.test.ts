import { describe, expect, it } from 'vitest';
import {
  MAX_PTY_DIMENSION,
  clampPtyDimension,
  isBoolean,
  isFiniteNumber,
  isFiniteNumberInRange,
  isNonEmptyString,
  isRecord,
  isString,
  isStringArray,
  validatePtySpawnRequest,
} from './validate';

describe('clampPtyDimension', () => {
  it('clamps into [1, MAX] and floors fractions', () => {
    expect(clampPtyDimension(0)).toBe(1);
    expect(clampPtyDimension(-5)).toBe(1);
    expect(clampPtyDimension(80.7)).toBe(80);
    expect(clampPtyDimension(99999)).toBe(MAX_PTY_DIMENSION);
    expect(clampPtyDimension(120)).toBe(120);
  });

  it('coerces non-finite input to the safe minimum', () => {
    expect(clampPtyDimension(Number.NaN)).toBe(1);
    expect(clampPtyDimension(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('composable guards', () => {
  it('isRecord accepts plain objects but not arrays or null', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('isString and isNonEmptyString distinguish blank strings', () => {
    expect(isString('')).toBe(true);
    expect(isString(5)).toBe(false);
    expect(isNonEmptyString('x')).toBe(true);
    expect(isNonEmptyString('  ')).toBe(false);
    expect(isNonEmptyString(5)).toBe(false);
  });

  it('isFiniteNumber rejects NaN, Infinity, and numeric strings', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-1.5)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
  });

  it('isFiniteNumberInRange enforces inclusive bounds', () => {
    expect(isFiniteNumberInRange(1, 1, 1000)).toBe(true);
    expect(isFiniteNumberInRange(1000, 1, 1000)).toBe(true);
    expect(isFiniteNumberInRange(0, 1, 1000)).toBe(false);
    expect(isFiniteNumberInRange(1001, 1, 1000)).toBe(false);
    expect(isFiniteNumberInRange(Number.NaN, 1, 1000)).toBe(false);
  });

  it('isStringArray requires every entry to be a string', () => {
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray(['a', 1])).toBe(false);
    expect(isStringArray('a')).toBe(false);
  });

  it('isBoolean accepts only booleans', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean('true')).toBe(false);
  });
});

describe('validatePtySpawnRequest', () => {
  it('throws when the payload is an array rather than a record', () => {
    expect(() => validatePtySpawnRequest([])).toThrow(/pty:spawn/);
  });

  it('rejects non-record payloads', () => {
    expect(() => validatePtySpawnRequest(null)).toThrow(/pty:spawn/);
    expect(() => validatePtySpawnRequest('spawn')).toThrow(/pty:spawn/);
  });

  it('rejects NaN and Infinity dimensions', () => {
    expect(() =>
      validatePtySpawnRequest({ cols: Number.NaN, rows: 24 }),
    ).toThrow(/cols/);
    expect(() =>
      validatePtySpawnRequest({ cols: 80, rows: Number.POSITIVE_INFINITY }),
    ).toThrow(/rows/);
  });

  it('rejects the numeric string "5" for cols', () => {
    expect(() => validatePtySpawnRequest({ cols: '5', rows: 24 })).toThrow(
      /cols/,
    );
  });

  it('throws when cols is missing', () => {
    expect(() => validatePtySpawnRequest({ rows: 24 })).toThrow(/cols/);
  });

  it('clamps cols of 0 up to 1', () => {
    expect(validatePtySpawnRequest({ cols: 0, rows: 24 }).cols).toBe(1);
  });

  it('clamps an oversized cols of 99999 down to MAX_PTY_DIMENSION', () => {
    const result = validatePtySpawnRequest({ cols: 99999, rows: 24 });
    expect(result.cols).toBe(MAX_PTY_DIMENSION);
    expect(result.cols).toBe(1000);
  });

  it('floors a fractional cols of 80.7 to 80', () => {
    expect(validatePtySpawnRequest({ cols: 80.7, rows: 24 }).cols).toBe(80);
  });

  it('returns the validated dimensions for a minimal payload', () => {
    expect(validatePtySpawnRequest({ cols: 80, rows: 24 })).toEqual({
      cols: 80,
      rows: 24,
    });
  });

  it('passes through a non-empty cardId but treats it as optional', () => {
    expect(
      validatePtySpawnRequest({ cols: 80, rows: 24, cardId: 'card-1' }),
    ).toEqual({ cols: 80, rows: 24, cardId: 'card-1' });
    expect(
      validatePtySpawnRequest({ cols: 80, rows: 24 }).cardId,
    ).toBeUndefined();
    expect(
      validatePtySpawnRequest({ cols: 80, rows: 24, cardId: '   ' }).cardId,
    ).toBeUndefined();
  });
});
