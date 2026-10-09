import { describe, it, expect } from 'vitest';
import { CATEGORY_LABELS, filterIcons, loadIcons } from './icons';
import { parseSvgPath } from '../geometry/svgpath';

describe('icons', () => {
  it('loads fill icons without logos', async () => {
    const icons = await loadIcons();
    expect(icons.length).toBeGreaterThan(1000);
    expect(icons.every((i) => i.name.endsWith('-fill'))).toBe(true);
    expect(icons.some((i) => i.category === 'Logos')).toBe(false);
    expect(icons.find((i) => i.name === 'emotion-laugh-fill')).toBeDefined();
  });

  it('every icon path is parseable', async () => {
    for (const i of await loadIcons()) expect(() => parseSvgPath(i.path)).not.toThrow();
  });

  it('every category has a French label', async () => {
    const cats = new Set((await loadIcons()).map((i) => i.category));
    for (const c of cats) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });

  it('filters by query and category', async () => {
    const icons = await loadIcons();
    const r = filterIcons(icons, 'heart', null);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.name.includes('heart'))).toBe(true);
    expect(filterIcons(icons, '', 'Weather').every((i) => i.category === 'Weather')).toBe(true);
  });
});
