import { describe, it, expect } from 'vitest';
import { buildKeychain } from '../geometry/keychain';
import { buildMeshes } from './keychain3d';
import { isWatertight, volume } from './check';
import { DEFAULT_PARAMS } from '../params';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();
const g = buildKeychain(DEFAULT_PARAMS, font)!;

const zRange = (pos: number[]) => {
  const zs = pos.filter((_, i) => i % 3 === 2);
  return [Math.min(...zs), Math.max(...zs)];
};

describe('buildMeshes', () => {
  it('builds watertight base and letters at expected heights', () => {
    const m = buildMeshes(g, DEFAULT_PARAMS);
    expect(isWatertight(m.base)).toBe(true);
    expect(isWatertight(m.letters)).toBe(true);
    expect(volume(m.base)).toBeGreaterThan(0);
    expect(volume(m.letters)).toBeGreaterThan(0);
    expect(zRange(m.base.positions)).toEqual([0, 3]);
    const [lz0, lz1] = zRange(m.letters.positions);
    expect(lz0).toBeCloseTo(2.4, 6);
    expect(lz1).toBeCloseTo(4.5, 6);
  });

  it('without pocket the letters sit on top', () => {
    const m = buildMeshes(g, { ...DEFAULT_PARAMS, pocketDepth: 0 });
    expect(zRange(m.letters.positions)[0]).toBeCloseTo(3, 6);
    expect(isWatertight(m.base)).toBe(true);
  });

  it('pocket removes material from the base', () => {
    const solid = buildMeshes(g, { ...DEFAULT_PARAMS, pocketDepth: 0 });
    const pocketed = buildMeshes(g, DEFAULT_PARAMS);
    expect(volume(pocketed.base)).toBeLessThan(volume(solid.base));
  });
});
