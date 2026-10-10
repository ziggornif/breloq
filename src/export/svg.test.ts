import { describe, it, expect } from 'vitest';
import { shapeToSvg, xtoolSvg } from './svg';
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

describe('xtoolSvg', () => {
  const base = toShape([makePath([0, 0, 30, 0, 30, 10, 0, 10])]);
  const letters = toShape([makePath([3, 3, 27, 3, 27, 7, 3, 7])]);
  const svg = xtoolSvg({ base, letters, width: 30, height: 10 });

  it('stacks the assembled base above the letters layer, in mm', () => {
    expect(svg).toContain('width="30mm"');
    expect(svg).toContain('height="30mm"'); // 10 + 10 d'écart + 10
    expect(svg).toContain('viewBox="0 0 30 30"');
  });

  it('cuts the base, scores the letter outline on it, and cuts the letters below', () => {
    const paths = svg.match(/<path [^>]*>/g)!;
    expect(paths).toHaveLength(3);
    const [cutBase, score, cutLetters] = paths;
    expect(cutBase).toContain('data-processing-type="VECTOR_CUTTING"');
    expect(cutBase).toContain('stroke="#cc3333"');
    expect(cutBase).toContain('M0 0L30 0L30 10L0 10Z');
    expect(score).toContain('data-processing-type="VECTOR_ENGRAVING"');
    expect(score).toContain('stroke="#3333cc"');
    expect(score).toContain('M3 3L27 3L27 7L3 7Z');
    expect(cutLetters).toContain('data-processing-type="VECTOR_CUTTING"');
    expect(cutLetters).toContain('M3 23L27 23L27 27L3 27Z');
  });
});
