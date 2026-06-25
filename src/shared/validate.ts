/**
 * Runtime payload validation for renderer->main IPC. Hand-rolled composable
 * guards (no schema library); per-channel validators either return a typed
 * value or throw a descriptive Error that `ipcMain.handle` surfaces to the
 * renderer as a rejected promise.
 *
 * Ported from upstream's src/main/ipc/validate.ts. Kept framework-free so
 * it lives in shared/* and never imports electron.
 */

// -- Composable guards -------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isFiniteNumberInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

// -- pty:spawn ---------------------------------------------------------------

export const MAX_PTY_DIMENSION = 1000;

export interface ValidatedPtySpawnRequest {
  cols: number;
  rows: number;
  cardId?: string;
}

function invalidSpawn(message: string): never {
  throw new Error(`Invalid pty:spawn payload: ${message}`);
}

/**
 * Clamp a PTY dimension into [1, MAX_PTY_DIMENSION], flooring fractions and
 * coercing non-finite input (NaN/Infinity) to the safe minimum of 1. Shared by
 * pty:spawn validation and the pty:resize path so both reject bad geometry.
 */
export function clampPtyDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PTY_DIMENSION, Math.max(1, Math.floor(value)));
}

/**
 * Validates a renderer-supplied pty:spawn payload before it reaches the PTY
 * manager. Throws a descriptive Error on a non-record payload or on a
 * missing / non-finite (NaN/Infinity) / non-number `cols` or `rows`; otherwise
 * clamps each dimension to [1, MAX_PTY_DIMENSION] (flooring fractions) and
 * passes through `cardId` when it is a non-empty string.
 */
export function validatePtySpawnRequest(
  value: unknown,
): ValidatedPtySpawnRequest {
  if (!isRecord(value)) invalidSpawn('payload must be an object');
  if (!isFiniteNumber(value.cols)) {
    invalidSpawn('cols must be a finite number');
  }
  if (!isFiniteNumber(value.rows)) {
    invalidSpawn('rows must be a finite number');
  }

  const request: ValidatedPtySpawnRequest = {
    cols: clampPtyDimension(value.cols),
    rows: clampPtyDimension(value.rows),
  };

  if (isNonEmptyString(value.cardId)) {
    request.cardId = value.cardId;
  }

  return request;
}
