import { describe, expect, it } from 'vitest';
import { writeCardRectStyle } from './cardStyleWriter';

describe('writeCardRectStyle', () => {
  it('writes only position while dragging a card', () => {
    const element = {
      style: {
        height: '520px',
        left: '40px',
        top: '40px',
        width: '820px',
      },
    } as HTMLElement;

    writeCardRectStyle(
      element,
      { height: 520, width: 820, x: 88, y: 120 },
      'position',
    );

    expect(element.style.left).toBe('88px');
    expect(element.style.top).toBe('120px');
    expect(element.style.width).toBe('820px');
    expect(element.style.height).toBe('520px');
  });

  it('writes size as well when resizing or syncing the full rect', () => {
    const element = {
      style: {
        height: '520px',
        left: '40px',
        top: '40px',
        width: '820px',
      },
    } as HTMLElement;

    writeCardRectStyle(
      element,
      { height: 560, width: 860, x: 40, y: 40 },
      'full',
    );

    expect(element.style.left).toBe('40px');
    expect(element.style.top).toBe('40px');
    expect(element.style.width).toBe('860px');
    expect(element.style.height).toBe('560px');
  });
});
