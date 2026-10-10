import { describe, it, expect } from 'vitest';
import { flattenCommands } from './flatten';
import { area, union } from './clip';
import type { PathCommand } from './types';

const square: PathCommand[] = [
  { type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 },
  { type: 'L', x: 10, y: 10 }, { type: 'L', x: 0, y: 10 }, { type: 'Z' },
];

describe('flattenCommands', () => {
  it('converts lines to one contour', () => {
    const s = flattenCommands(square);
    expect(s).toHaveLength(1);
    expect(s[0]).toHaveLength(4);
    expect(Math.abs(area(s))).toBeCloseTo(100, 3);
  });

  it('starts a new contour on M without Z', () => {
    const noZ: PathCommand[] = [
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 1, y: 0 }, { type: 'L', x: 1, y: 1 },
      { type: 'M', x: 5, y: 5 }, { type: 'L', x: 6, y: 5 }, { type: 'L', x: 6, y: 6 },
    ];
    expect(flattenCommands(noZ)).toHaveLength(2);
  });

  it('drops duplicated closing point', () => {
    const closed: PathCommand[] = [...square.slice(0, 4), { type: 'L', x: 0, y: 0 }, { type: 'Z' }];
    expect(flattenCommands(closed)[0]).toHaveLength(4);
  });

  it('approximates a circle made of cubic curves', () => {
    const k = 0.5522847498 * 10;
    const c: PathCommand[] = [
      { type: 'M', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: k, x2: k, y2: 10, x: 0, y: 10 },
      { type: 'C', x1: -k, y1: 10, x2: -10, y2: k, x: -10, y: 0 },
      { type: 'C', x1: -10, y1: -k, x2: -k, y2: -10, x: 0, y: -10 },
      { type: 'C', x1: k, y1: -10, x2: 10, y2: -k, x: 10, y: 0 },
      { type: 'Z' },
    ];
    expect(Math.abs(area(union(flattenCommands(c))))).toBeCloseTo(Math.PI * 100, 0);
  });

  it('handles quadratic curves', () => {
    const q: PathCommand[] = [
      { type: 'M', x: 0, y: 0 }, { type: 'Q', x1: 5, y1: 10, x: 10, y: 0 }, { type: 'Z' },
    ];
    // aire sous une parabole de hauteur de contrôle 10 : 2/3 * 10 * 5
    expect(Math.abs(area(flattenCommands(q)))).toBeCloseTo((2 / 3) * 10 * 5, 0);
  });
});
