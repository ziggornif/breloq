import { describe, it, expect } from 'vitest';
import { textToShape } from './text';
import { area, bounds } from './clip';
import { loadTestFont } from '../test/fonts';

const font = loadTestFont();

describe('textToShape', () => {
  it('produces a merged shape sized by fontSize', () => {
    const r = textToShape(font, { text: 'Lexie', fontSize: 30, letterSpacing: 0 });
    const b = bounds(r.shape)!;
    expect(area(r.shape)).toBeGreaterThan(100);
    expect(b.maxY).toBeLessThan(5);            // au plus un léger débordement sous la ligne de base
    expect(b.minY).toBeLessThan(-15);          // les ascendantes montent (Y vers le bas)
    expect(b.maxX - b.minX).toBeGreaterThan(50);
    expect(r.missing).toEqual([]);
  });

  it('letter spacing widens the text', () => {
    const a = bounds(textToShape(font, { text: 'abc', fontSize: 20, letterSpacing: 0 }).shape)!;
    const b = bounds(textToShape(font, { text: 'abc', fontSize: 20, letterSpacing: 5 }).shape)!;
    expect(b.maxX - b.minX).toBeCloseTo(a.maxX - a.minX + 10, 0);
  });

  it('reports missing glyphs, ignores spaces and does not draw .notdef', () => {
    const r = textToShape(font, { text: 'a 漢', fontSize: 20, letterSpacing: 0 });
    expect(r.missing).toEqual(['漢']);
    const a = textToShape(font, { text: 'a', fontSize: 20, letterSpacing: 0 });
    expect(area(r.shape)).toBeCloseTo(area(a.shape), 3);
  });

  it('empty text gives empty shape', () => {
    expect(textToShape(font, { text: '', fontSize: 20, letterSpacing: 0 }).shape).toHaveLength(0);
  });
});
