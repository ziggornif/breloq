import { describe, it, expect } from 'vitest';
import { buildKeychain, type KeychainGeometry } from './keychain';
import { area, bounds, difference, isOuter, toShape } from './clip';
import { DEFAULT_PARAMS, type KeychainParams } from '../params';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();
const P = (o: Partial<KeychainParams> = {}): KeychainParams => ({ ...DEFAULT_PARAMS, ...o });
const SMILEY = 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z';
const outers = (g: KeychainGeometry) => g.base.filter(isOuter);
const holes = (g: KeychainGeometry) => g.base.filter((p) => !isOuter(p));

describe('buildKeychain', () => {
  it('base contains letters and is normalized at origin', () => {
    const g = buildKeychain(P({ holeEnabled: false }), font)!;
    expect(area(difference(g.letters, g.base))).toBeCloseTo(0, 1);
    const b = bounds(g.base)!;
    expect(b.minX).toBeCloseTo(0, 2);
    expect(b.minY).toBeCloseTo(0, 2);
    expect(g.width).toBeCloseTo(b.maxX, 2);
    expect(g.height).toBeCloseTo(b.maxY, 2);
  });

  it('base has no inner holes', () => {
    const g = buildKeychain(P({ holeEnabled: false }), font)!;
    expect(holes(g)).toHaveLength(0);
    expect(area(g.base)).toBeGreaterThan(area(g.letters));
  });

  it('outline width grows the base', () => {
    const a = buildKeychain(P({ holeEnabled: false, outlineWidth: 2 }), font)!;
    const b = buildKeychain(P({ holeEnabled: false, outlineWidth: 4 }), font)!;
    expect(b.width).toBeCloseTo(a.width + 4, 0);
  });

  it('left hole adds an attached ear with one hole of the right size', () => {
    const without = buildKeychain(P({ holeEnabled: false }), font)!;
    const g = buildKeychain(P({ holePosition: 'left' }), font)!;
    expect(g.width).toBeGreaterThan(without.width);
    expect(outers(g)).toHaveLength(outers(without).length); // l'oreille est fusionnée, pas d'îlot en plus
    expect(holes(g)).toHaveLength(1);
    expect(Math.abs(area(toShape(holes(g))))).toBeCloseTo(Math.PI * 4, 0); // r = 2
  });

  it('top hole extends height', () => {
    // texte à sommet plat : avec « Lexie » le centre tombe sur une lettre basse et l'oreille reste dans la boîte
    const without = buildKeychain(P({ text: 'HHH', holeEnabled: false }), font)!;
    const g = buildKeychain(P({ text: 'HHH', holePosition: 'top' }), font)!;
    expect(g.height).toBeGreaterThan(without.height);
  });

  it('icon is placed left of the text', () => {
    const without = buildKeychain(P({ holeEnabled: false }), font)!;
    const g = buildKeychain(P({ holeEnabled: false, iconEnabled: true, iconSize: 20, iconGap: 2 }), font, SMILEY)!;
    // le disque du smiley fait 20 unités sur 24 → 20 * 20/24 mm, plus iconGap
    expect(g.width).toBeCloseTo(without.width + 20 * (20 / 24) + 2, 0);
  });

  it('textWeight thickens letters', () => {
    const a = buildKeychain(P({ holeEnabled: false }), font)!;
    const b = buildKeychain(P({ holeEnabled: false, textWeight: 1 }), font)!;
    expect(area(b.letters)).toBeGreaterThan(area(a.letters));
  });

  it('returns null when nothing to draw', () => {
    expect(buildKeychain(P({ text: '  ' }), font)).toBeNull();
  });

  it('icon alone is drawable', () => {
    expect(buildKeychain(P({ text: '', iconEnabled: true }), font, SMILEY)).not.toBeNull();
  });
});
