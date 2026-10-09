import { describe, it, expect } from 'vitest';
import { shapeToSvg } from './svg';
import { makePath, toShape } from '../geometry/clip';

describe('shapeToSvg', () => {
  it('writes mm dimensions and one path per contour', () => {
    const s = toShape([
      makePath([0, 0, 10, 0, 10, 5, 0, 5]),
      makePath([20, 0, 21.5, 0, 21.5, 1]),
    ]);
    const svg = shapeToSvg(s, 21.5, 5);
    expect(svg).toContain('width="21.5mm"');
    expect(svg).toContain('height="5mm"');
    expect(svg).toContain('viewBox="0 0 21.5 5"');
    expect(svg).toContain('M0 0L10 0L10 5L0 5Z');
    expect(svg).toContain('M20 0L21.5 0L21.5 1Z');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('fill="none"');
  });
});
