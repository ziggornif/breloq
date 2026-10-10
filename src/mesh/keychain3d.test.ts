import { describe, it, expect } from 'vitest';
import { buildKeychain } from '../geometry/keychain';
import { buildMeshes, buildLaserMeshes, LASER_SHEET_THICKNESS } from './keychain3d';
import { isClosedByPosition, isWatertight, volume } from './check';
import { parseIconResponse } from '../icons/iconify';
import { FIXTURES } from '../test/iconify-fixtures';
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

  it.each(['ri:emotion-laugh-fill', 'ri:lock-fill', 'ri:corner-right-up-fill', 'ri:battery-charge-fill',
    'mingcute:music-fill', 'game-icons:cat', 'bi:arrow-down-circle', 'fa6-solid:cat'])(
    'icon %s: meshes stay closed once a slicer welds vertices by position', (id) => {
      const icon = parseIconResponse(FIXTURES[id], id.split(':')[1]);
      const p = { ...DEFAULT_PARAMS, iconEnabled: true };
      const m = buildMeshes(buildKeychain(p, font, icon)!, p);
      expect(isClosedByPosition(m.letters)).toBe(true);
      expect(isClosedByPosition(m.base)).toBe(true);
    });
});

describe('buildLaserMeshes', () => {
  it('stacks two plywood sheets without pocket', () => {
    const m = buildLaserMeshes(g);
    expect(LASER_SHEET_THICKNESS).toBe(3);
    for (const part of [m.base, m.letters]) {
      expect(isWatertight(part)).toBe(true);
      expect(isClosedByPosition(part)).toBe(true);
    }
    expect(zRange(m.base.positions)).toEqual([0, 3]);
    expect(zRange(m.letters.positions)).toEqual([3, 6]);
    const solid = buildMeshes(g, { ...DEFAULT_PARAMS, pocketDepth: 0 });
    expect(volume(m.base)).toBeCloseTo(volume(solid.base), 6);
  });

  it('honours a custom thickness', () => {
    const m = buildLaserMeshes(g, 2);
    expect(zRange(m.base.positions)).toEqual([0, 2]);
    expect(zRange(m.letters.positions)).toEqual([2, 4]);
  });
});
