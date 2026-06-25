import { describe, expect, it } from 'vitest';
import { ptyDataDisposition, sessionsToReap } from './ptyPersistence';

describe('ptyDataDisposition', () => {
  it('buffers while replaying regardless of attachment', () => {
    expect(ptyDataDisposition({ attached: true, replaying: true })).toBe('buffer');
    expect(ptyDataDisposition({ attached: false, replaying: true })).toBe('buffer');
  });

  it('sends when attached and not replaying', () => {
    expect(ptyDataDisposition({ attached: true, replaying: false })).toBe('send');
  });

  it('drops when detached and not replaying', () => {
    expect(ptyDataDisposition({ attached: false, replaying: false })).toBe('drop');
  });
});

describe('sessionsToReap', () => {
  it('reaps keyed sessions whose card is gone', () => {
    const sessions = [
      { id: 'a', key: 'card-1' },
      { id: 'b', key: 'card-2' },
      { id: 'c', key: 'card-3' },
    ];
    expect(sessionsToReap(sessions, ['card-2', 'card-3'])).toEqual(['a']);
  });

  it('reaps a gone card regardless of attachment (deck-driven)', () => {
    const sessions = [{ id: 'a', key: 'gone' }];
    expect(sessionsToReap(sessions, [])).toEqual(['a']);
  });

  it('never reaps unkeyed one-off sessions', () => {
    const sessions = [{ id: 'a' }];
    expect(sessionsToReap(sessions, [])).toEqual([]);
  });

  it('keeps sessions whose card is still live', () => {
    const sessions = [{ id: 'a', key: 'card-1' }];
    expect(sessionsToReap(sessions, ['card-1'])).toEqual([]);
  });
});
