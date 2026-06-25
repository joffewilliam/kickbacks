import { describe, expect, it } from 'vitest';
import { parseOsc133Payload } from './terminalShellIntegration';

describe('parseOsc133Payload', () => {
  it('parses the prompt lifecycle marks A/B/C', () => {
    expect(parseOsc133Payload('A')).toEqual({ kind: 'A' });
    expect(parseOsc133Payload('B')).toEqual({ kind: 'B' });
    expect(parseOsc133Payload('C')).toEqual({ kind: 'C' });
  });

  it('parses command-finished (D) with an exit code', () => {
    expect(parseOsc133Payload('D;0')).toEqual({ kind: 'D', exitCode: 0 });
    expect(parseOsc133Payload('D;1')).toEqual({ kind: 'D', exitCode: 1 });
    expect(parseOsc133Payload('D;130')).toEqual({ kind: 'D', exitCode: 130 });
  });

  it('parses D with no code as command-finished without an exit code', () => {
    expect(parseOsc133Payload('D')).toEqual({ kind: 'D' });
  });

  it('treats a non-numeric D code as command-finished without an exit code', () => {
    expect(parseOsc133Payload('D;garbage')).toEqual({ kind: 'D' });
    expect(parseOsc133Payload('D;not-a-number')).toEqual({ kind: 'D' });
  });

  it('ignores trailing params after the exit code on D', () => {
    expect(parseOsc133Payload('D;130;extra')).toEqual({
      kind: 'D',
      exitCode: 130,
    });
  });

  it('tolerates extra params on prompt marks (oh-my-posh / starship style)', () => {
    expect(parseOsc133Payload('A;special_key=1')).toEqual({ kind: 'A' });
    expect(parseOsc133Payload('B;aid=123;cl=m')).toEqual({ kind: 'B' });
  });

  it('returns null on malformed or unknown payloads', () => {
    expect(parseOsc133Payload('')).toBeNull();
    expect(parseOsc133Payload('Z')).toBeNull();
    expect(parseOsc133Payload('a')).toBeNull();
    expect(parseOsc133Payload('Z;1')).toBeNull();
    expect(parseOsc133Payload(';A')).toBeNull();
  });
});
