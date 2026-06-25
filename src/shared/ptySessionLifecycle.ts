export interface PtySessionFinalizer {
  finalize(): boolean;
}

export interface PtySessionFinalizerInput {
  cleanup?: () => void;
  remove: () => void;
}

export function createPtySessionFinalizer({
  cleanup,
  remove,
}: PtySessionFinalizerInput): PtySessionFinalizer {
  let finalized = false;

  return {
    finalize() {
      if (finalized) return false;
      finalized = true;
      try {
        cleanup?.();
      } catch {
        // Cleanup is best effort; session removal must still happen.
      } finally {
        remove();
      }
      return true;
    },
  };
}
