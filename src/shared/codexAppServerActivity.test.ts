import { describe, expect, it } from 'vitest';
import {
  codexActivityFromThreadListResult,
  codexActivityFromAppServerMessage,
  codexThreadListHasActiveTurn,
} from './codexAppServerActivity';

describe('Codex app-server activity parsing', () => {
  it('marks a Codex turn active from a turn started notification', () => {
    const event = codexActivityFromAppServerMessage({
      method: 'turn/started',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'inProgress' },
      },
    });

    expect(event).toEqual({
      active: true,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('marks Codex idle from a completed turn notification', () => {
    const event = codexActivityFromAppServerMessage({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed' },
      },
    });

    expect(event).toEqual({
      active: false,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });
  });

  it('reads active state from thread status without inspecting preview text', () => {
    const active = codexThreadListHasActiveTurn({
      data: [
        {
          id: 'thread-1',
          preview: 'private user prompt should not matter',
          status: { type: 'active', activeFlags: [] },
        },
      ],
    });

    expect(active).toBe(true);
  });

  it('treats a thread list without active statuses as idle', () => {
    const active = codexThreadListHasActiveTurn({
      data: [
        {
          id: 'thread-1',
          preview: 'Working (11s) would be ignored here',
          status: { type: 'idle' },
        },
      ],
    });

    expect(active).toBe(false);
  });

  it('does not mark Codex idle from notLoaded thread-list polling results', () => {
    const event = codexActivityFromThreadListResult({
      data: [
        {
          id: 'thread-1',
          preview: 'historical prompt',
          status: { type: 'notLoaded' },
        },
      ],
    });

    expect(event).toBeNull();
  });

  it('can mark Codex active from an active thread-list polling result', () => {
    const event = codexActivityFromThreadListResult({
      data: [
        {
          id: 'thread-1',
          preview: 'current prompt',
          status: { type: 'active', activeFlags: [] },
        },
      ],
    });

    expect(event).toEqual({
      active: true,
      provider: 'codex',
      source: 'codex-app-server',
      threadId: 'thread-1',
      turnId: null,
    });
  });
});
