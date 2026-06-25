import { describe, expect, it } from 'vitest';
import { createFrameCoalescer } from './frameCoalescer';

describe('createFrameCoalescer', () => {
  it('coalesces many live updates into one frame callback with the latest value', () => {
    let nextFrameId = 1;
    const queued = new Map<number, () => void>();
    const writes: number[] = [];
    const coalescer = createFrameCoalescer<number>({
      cancelFrame: (id) => queued.delete(id),
      requestFrame: (callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        queued.set(id, callback);
        return id;
      },
      write: (value) => writes.push(value),
    });

    coalescer.request(1);
    coalescer.request(2);
    coalescer.request(3);

    expect(writes).toEqual([]);
    expect(queued.size).toBe(1);

    const [frameId, callback] = [...queued.entries()][0];
    queued.delete(frameId);
    callback();

    expect(writes).toEqual([3]);
    expect(queued.size).toBe(0);
  });

  it('cancels pending frame writes', () => {
    const queued = new Map<number, () => void>();
    const writes: number[] = [];
    const coalescer = createFrameCoalescer<number>({
      cancelFrame: (id) => queued.delete(id),
      requestFrame: (callback) => {
        queued.set(1, callback);
        return 1;
      },
      write: (value) => writes.push(value),
    });

    coalescer.request(42);
    coalescer.cancel();

    expect(queued.size).toBe(0);
    expect(writes).toEqual([]);
  });
});
