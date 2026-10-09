import { describe, it, expect } from 'vitest';
import { parseSvgPath } from './svgpath';

describe('parseSvgPath', () => {
  it('parses absolute M L H V Z', () => {
    expect(parseSvgPath('M1 2L3 4H5V6Z')).toEqual([
      { type: 'M', x: 1, y: 2 }, { type: 'L', x: 3, y: 4 },
      { type: 'L', x: 5, y: 4 }, { type: 'L', x: 5, y: 6 }, { type: 'Z' },
    ]);
  });

  it('parses cubic with compact numbers and implicit lineto', () => {
    expect(parseSvgPath('M0 0 1 1C1.5-2 .5.5 3 3')).toEqual([
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 1, y: 1 },
      { type: 'C', x1: 1.5, y1: -2, x2: 0.5, y2: 0.5, x: 3, y: 3 },
    ]);
  });

  it('parses relative commands', () => {
    expect(parseSvgPath('m1 1l2 0h1v1z')).toEqual([
      { type: 'M', x: 1, y: 1 }, { type: 'L', x: 3, y: 1 },
      { type: 'L', x: 4, y: 1 }, { type: 'L', x: 4, y: 2 }, { type: 'Z' },
    ]);
  });

  it('applies scale and translation', () => {
    expect(parseSvgPath('M2 4', 0.5, 10, 20)).toEqual([{ type: 'M', x: 11, y: 22 }]);
  });

  it('rejects arcs', () => {
    expect(() => parseSvgPath('M0 0A1 1 0 0 1 2 2')).toThrow('Unsupported SVG path command: A');
  });

  it('parses a real Remix icon', () => {
    const d = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z';
    expect(parseSvgPath(d).filter((c) => c.type === 'C')).toHaveLength(4);
  });

  it('restarts the current point at the subpath start after Z, emitting M before a drawing command', () => {
    expect(parseSvgPath('M0 0L1 0L1 1ZL0 1')).toEqual([
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 1, y: 0 }, { type: 'L', x: 1, y: 1 },
      { type: 'Z' }, { type: 'M', x: 0, y: 0 }, { type: 'L', x: 0, y: 1 },
    ]);
  });

  it('rejects numbers following Z instead of looping forever', () => {
    expect(() => parseSvgPath('M0 0L1 0Z 1 1')).toThrow();
  });

  it('rejects a path that does not start with a command', () => {
    expect(() => parseSvgPath('1 2L3 4')).toThrow();
  });
});
