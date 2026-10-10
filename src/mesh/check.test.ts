import { describe, it, expect } from 'vitest';
import { extrude } from './extrude';
import { isWatertight, volume } from './check';
import { makePath, toShape } from '../geometry/clip';

const box = () => extrude(toShape([makePath([0, 0, 10, 0, 10, 10, 0, 10])]), 0, 2);

describe('mesh checks', () => {
  it('closed consistent mesh is watertight with positive volume', () => {
    const m = box();
    expect(isWatertight(m)).toBe(true);
    expect(volume(m)).toBeCloseTo(200, 6);
  });

  it('open mesh (a cap removed) is not watertight', () => {
    const m = box();
    m.indices = m.indices.slice(6); // drop first two triangles (a cap's worth of faces)
    expect(isWatertight(m)).toBe(false);
  });

  it('inverted winding gives negative volume', () => {
    const m = box();
    const idx = [...m.indices];
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    expect(volume({ positions: m.positions, indices: idx })).toBeCloseTo(-200, 6);
  });

  it('duplicated triangle is not watertight', () => {
    const m = box();
    m.indices.push(m.indices[0], m.indices[1], m.indices[2]);
    expect(isWatertight(m)).toBe(false);
  });
});
