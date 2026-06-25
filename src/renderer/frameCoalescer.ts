export interface FrameCoalescer<T> {
  cancel(): void;
  request(value: T): void;
}

export interface FrameCoalescerOptions<T> {
  cancelFrame: (id: number) => void;
  requestFrame: (callback: () => void) => number;
  write: (value: T) => void;
}

export function createFrameCoalescer<T>({
  cancelFrame,
  requestFrame,
  write,
}: FrameCoalescerOptions<T>): FrameCoalescer<T> {
  let frameId: number | null = null;
  let latestValue: T | null = null;

  return {
    cancel() {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      latestValue = null;
    },
    request(value) {
      latestValue = value;
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        const valueToWrite = latestValue;
        latestValue = null;
        if (valueToWrite !== null) write(valueToWrite);
      });
    },
  };
}
