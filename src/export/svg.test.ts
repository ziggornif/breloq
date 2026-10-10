import { describe, it, expect } from 'vitest';
import { laserSvg } from './svg';
import { makePath, toShape } from '../geometry/clip';

describe('laserSvg', () => {
  const base = toShape([makePath([0, 0, 30, 0, 30, 10, 0, 10])]);
  const letters = toShape([makePath([3, 3, 27, 3, 27, 7, 3, 7])]);
  const svg = laserSvg({ base, letters, width: 30, height: 10 });

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
