import { describe, it, expect } from 'vitest';
import {
  area, bounds, circle, cleanPath, difference, emptyShape, groupPolygons, intersect, isOuter,
  makePath, offset, outerOnly, toShape, translate, union,
} from './clip';

const rect = (x: number, y: number, w: number, h: number) =>
  toShape([makePath([x, y, x + w, y, x + w, y + h, x, y + h])]);

describe('clip', () => {
  it('makePath converts mm to integer µm', () => {
    expect(makePath([1.5, 2, 0.0004, 3])).toEqual([{ x: 1500, y: 2000 }, { x: 0, y: 3000 }]);
  });

  it('union merges overlapping squares', () => {
    const u = union(toShape([...rect(0, 0, 10, 10), ...rect(5, 5, 10, 10)]));
    expect(u.length).toBe(1);
    expect(area(u)).toBeCloseTo(175, 3);
  });

  it('difference punches a hole', () => {
    const d = difference(rect(0, 0, 10, 10), rect(2.5, 2.5, 5, 5));
    expect(area(d)).toBeCloseTo(75, 3);
    expect(groupPolygons(d)).toHaveLength(1);
    expect(groupPolygons(d)[0].holes).toHaveLength(1);
  });

  it('intersect keeps overlap', () => {
    expect(area(intersect(rect(0, 0, 10, 10), rect(5, 0, 10, 10)))).toBeCloseTo(50, 3);
  });

  it('offset grows with round joins', () => {
    const o = offset(rect(0, 0, 10, 10), 1);
    // 10x10 + 4 bandes 10x1 + disque r=1
    expect(area(o)).toBeCloseTo(100 + 40 + Math.PI, 1);
    expect(bounds(o)).toEqual({ minX: -1, minY: -1, maxX: 11, maxY: 11 });
    expect(offset(rect(0, 0, 10, 10), 0)).toHaveLength(1);
  });

  it('negative offset erodes', () => {
    expect(area(offset(rect(0, 0, 10, 10), -1))).toBeCloseTo(64, 1);
  });

  it('offset of an L shape stays a single outline', () => {
    const L = union(toShape([...rect(0, 0, 2, 10), ...rect(0, 8, 10, 2)]));
    const o = offset(L, 1);
    expect(o).toHaveLength(1);
    expect(isOuter(o[0])).toBe(true);
  });

  it('outerOnly fills holes', () => {
    const ring = difference(rect(0, 0, 10, 10), rect(2.5, 2.5, 5, 5));
    expect(area(outerOnly(ring))).toBeCloseTo(100, 3);
  });

  it('circle has expected area and positive orientation', () => {
    const c = circle(0, 0, 5);
    expect(area(c)).toBeCloseTo(Math.PI * 25, 0);
    expect(isOuter(c[0])).toBe(true);
  });

  it('bounds and translate', () => {
    const t = translate(rect(0, 0, 10, 4), 1.5, -2);
    expect(bounds(t)).toEqual({ minX: 1.5, minY: -2, maxX: 11.5, maxY: 2 });
    expect(bounds(emptyShape())).toBeNull();
  });

  it('groupPolygons separates islands and assigns holes to the right outer', () => {
    const two = union(toShape([...rect(0, 0, 10, 10), ...rect(20, 0, 10, 10)]));
    const withHole = difference(two, rect(22, 2, 2, 2));
    const g = groupPolygons(withHole);
    expect(g).toHaveLength(2);
    const owner = g.find((p) => p.holes.length === 1)!;
    expect(bounds([owner.outer])!.minX).toBe(20);
  });

  it('groupPolygons handles island inside a hole', () => {
    const s = union(toShape([...difference(rect(0, 0, 20, 20), rect(2, 2, 16, 16)), ...rect(8, 8, 4, 4)]));
    const g = groupPolygons(s);
    expect(g).toHaveLength(2);
    expect(g.find((p) => bounds([p.outer])!.minX === 8)!.holes).toHaveLength(0);
    expect(g.find((p) => bounds([p.outer])!.minX === 0)!.holes).toHaveLength(1);
  });

  it('cleanPath removes duplicates and collinear points', () => {
    const p = makePath([0, 0, 5, 0, 10, 0, 10, 0, 10, 10, 0, 10]);
    expect(cleanPath(p)).toHaveLength(4);
  });
});
