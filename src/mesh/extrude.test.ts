import { describe, it, expect } from 'vitest';
import { extrude, mergeMeshes } from './extrude';
import { isWatertight, volume } from './check';
import { circle, difference, makePath, toShape } from '../geometry/clip';

const rect = (x: number, y: number, w: number, h: number) =>
  toShape([makePath([x, y, x + w, y, x + w, y + h, x, y + h])]);

describe('extrude', () => {
  it('box is watertight with correct volume', () => {
    const m = extrude(rect(0, 0, 10, 20), 0, 3);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(600, 3);
  });

  it('shape with hole is watertight', () => {
    const m = extrude(difference(rect(0, 0, 10, 10), rect(3, 3, 4, 4)), 1, 2);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(84, 3);
  });

  it('collinear points do not break manifoldness', () => {
    const p = makePath([0, 0, 5, 0, 10, 0, 10, 10, 0, 10]);
    expect(isWatertight(extrude(toShape([p]), 0, 1))).toBe(true);
  });

  it('circle is watertight', () => {
    const m = extrude(circle(0, 0, 5), 0, 2);
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(Math.PI * 25 * 2, 0);
  });

  it('flips Y so text reads from above', () => {
    const m = extrude(rect(0, 0, 1, 5), 0, 1);
    const ys = m.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-5, 6);
    expect(Math.max(...ys)).toBeCloseTo(0, 6);
  });

  it('mergeMeshes offsets indices', () => {
    const a = extrude(rect(0, 0, 1, 1), 0, 1);
    const m = mergeMeshes(a, extrude(rect(5, 5, 1, 1), 0, 1));
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(2, 6);
  });
});

describe('extrude degenerate input', () => {
  it('skips a group whose outer ring cleans to nothing instead of promoting a hole', () => {
    const sliver = makePath([0, 0, 5, 0, 10, 0]); // collinear -> < 3 points
    const m = extrude(toShape([sliver]), 0, 1);
    expect(m.indices.length).toBe(0);
  });
});
