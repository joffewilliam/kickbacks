import { describe, expect, it } from 'vitest';
import { createPtySessionFinalizer } from './ptySessionLifecycle';

describe('PTY session lifecycle finalizer', () => {
  it('runs cleanup and removal only once when kill is followed by exit', () => {
    const events: string[] = [];
    const finalizer = createPtySessionFinalizer({
      cleanup: () => events.push('cleanup'),
      remove: () => events.push('remove'),
    });

    expect(finalizer.finalize()).toBe(true);
    expect(finalizer.finalize()).toBe(false);
    expect(events).toEqual(['cleanup', 'remove']);
  });

  it('still removes the session when cleanup throws', () => {
    const events: string[] = [];
    const finalizer = createPtySessionFinalizer({
      cleanup: () => {
        events.push('cleanup');
        throw new Error('cleanup failed');
      },
      remove: () => events.push('remove'),
    });

    expect(() => finalizer.finalize()).not.toThrow();
    expect(events).toEqual(['cleanup', 'remove']);
  });
});
