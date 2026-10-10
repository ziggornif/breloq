import { describe, it, expect } from 'vitest';
import { parseSvgPath } from './svgpath';
import { flattenCommands } from './flatten';
import { area, bounds, union } from './clip';

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

  it('rejects unknown commands', () => {
    expect(() => parseSvgPath('M0 0B1 1')).toThrow('Unsupported SVG path command: B');
  });

  describe('arcs', () => {
    const shapeOf = (d: string) => union(flattenCommands(parseSvgPath(d), 0.05));

    it('a full circle made of two arcs has area πr²', () => {
      const s = shapeOf('M0 10A10 10 0 1 0 20 10A10 10 0 1 0 0 10Z');
      expect(Math.abs(area(s))).toBeCloseTo(Math.PI * 100, 0);
      const b = bounds(s)!;
      expect(b.minX).toBeCloseTo(0, 1); expect(b.maxX).toBeCloseTo(20, 1);
      expect(b.minY).toBeCloseTo(0, 1); expect(b.maxY).toBeCloseTo(20, 1);
    });

    it('emits cubics ending exactly at the arc endpoint (relative form)', () => {
      const cmds = parseSvgPath('M2 2a3 3 0 0 1 6 0');
      const last = cmds[cmds.length - 1];
      expect(cmds.slice(1).every((c) => c.type === 'C')).toBe(true);
      expect(last).toMatchObject({ x: 8, y: 2 });
    });

    it('scales up radii too small to reach the endpoint (half circle)', () => {
      // r = 1 mais extrémités à 10 d'écart → r ajusté à 5, demi-disque fermé par Z
      const s = shapeOf('M0 0A1 1 0 0 1 10 0Z');
      expect(Math.abs(area(s))).toBeCloseTo((Math.PI * 25) / 2, 0);
    });

    it('treats zero radius as a straight line', () => {
      expect(parseSvgPath('M0 0A0 5 0 0 1 4 4')).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 4, y: 4 }]);
    });

    it('reads compact flags and implicit repetition (Iconify style)', () => {
      const a = parseSvgPath('M0 10a10 10 0 1 0 20 0a10 10 0 1 0-20 0');
      const b = parseSvgPath('M0 10a10 10 0 1020 0a10 10 0 10-20 0');
      expect(b).toEqual(a);
      const c = parseSvgPath('M0 10a10 10 0 1 0 20 0 10 10 0 1 0-20 0');
      expect(c).toEqual(a);
    });

    it('handles rotated elliptic arcs', () => {
      const s = shapeOf('M-10 0A10 5 90 1 0 10 0A10 5 90 1 0 -10 0Z');
      // ellipse 10×5 tournée de 90° : demi-axe horizontal 5 < 10 → rayons ×2 (20 vertical, 10 horizontal)
      expect(Math.abs(area(s))).toBeCloseTo(Math.PI * 200, 0);
      const b = bounds(s)!;
      expect(b.maxX - b.minX).toBeCloseTo(20, 1);
      expect(b.maxY - b.minY).toBeCloseTo(40, 1);
    });

    it('applies scale and translation to arcs', () => {
      const s = union(flattenCommands(parseSvgPath('M0 10A10 10 0 1 0 20 10A10 10 0 1 0 0 10Z', 0.5, 100, 0), 0.05));
      const b = bounds(s)!;
      expect(b.minX).toBeCloseTo(100, 1); expect(b.maxX).toBeCloseTo(110, 1);
    });
  });

  describe('smooth curves', () => {
    it('S reflects the previous cubic control point', () => {
      expect(parseSvgPath('M0 0C1 1 2 1 3 0S5 -1 6 0')).toEqual([
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 1, y1: 1, x2: 2, y2: 1, x: 3, y: 0 },
        { type: 'C', x1: 4, y1: -1, x2: 5, y2: -1, x: 6, y: 0 },
      ]);
    });

    it('s without previous cubic uses the current point, relative coordinates', () => {
      expect(parseSvgPath('M1 1s1 1 2 0')).toEqual([
        { type: 'M', x: 1, y: 1 },
        { type: 'C', x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 1 },
      ]);
    });

    it('T reflects the previous quadratic control point, chained', () => {
      expect(parseSvgPath('M0 0Q1 1 2 0T4 0t2 0')).toEqual([
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 1, y1: 1, x: 2, y: 0 },
        { type: 'Q', x1: 3, y1: -1, x: 4, y: 0 },
        { type: 'Q', x1: 5, y1: 1, x: 6, y: 0 },
      ]);
    });

    it('T after a non-quadratic uses the current point', () => {
      expect(parseSvgPath('M0 0L2 0T4 0')).toEqual([
        { type: 'M', x: 0, y: 0 }, { type: 'L', x: 2, y: 0 },
        { type: 'Q', x1: 2, y1: 0, x: 4, y: 0 },
      ]);
    });
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
