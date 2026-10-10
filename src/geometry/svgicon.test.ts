import { describe, it, expect } from 'vitest';
import { iconToShape, type IconSvg } from './svgicon';
import { area, bounds, isOuter } from './clip';
import { parseIconResponse } from '../icons/iconify';
import { FIXTURES } from '../test/iconify-fixtures';

const fx = (id: string): IconSvg => parseIconResponse(FIXTURES[id], id.split(':')[1]);
const box = (body: string, size = 24): IconSvg => ({ body, left: 0, top: 0, width: size, height: size });
const holes = (s: ReturnType<typeof iconToShape>) => s.filter((p) => !isOuter(p));

describe('iconToShape', () => {
  const filled = ['mdi:heart', 'mingcute:music-fill', 'bi:arrow-down-circle', 'bi:circle-fill', 'bi:align-bottom',
    'game-icons:cat', 'ph:heart-fill', 'ph:heart-duotone', 'fa6-solid:cat', 'ant-design:account-book-twotone'];
  for (const id of filled) {
    it(`${id}: non-empty shape inside the requested size`, () => {
      const icon = fx(id);
      const s = iconToShape(icon, 20);
      expect(area(s)).toBeGreaterThan(1);
      const b = bounds(s)!;
      const k = 20 / Math.max(icon.width, icon.height);
      expect(b.minX).toBeGreaterThanOrEqual(-0.01);
      expect(b.minY).toBeGreaterThanOrEqual(-0.01);
      expect(b.maxX).toBeLessThanOrEqual(icon.width * k + 0.01);
      expect(b.maxY).toBeLessThanOrEqual(icon.height * k + 0.01);
      // l'icône occupe une bonne part de sa boîte (pas d'erreur d'échelle d'un facteur 16/24/512)
      expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeGreaterThan(20 * 0.6);
    });
  }

  it('maps a 16×16 viewBox (bi, default size) onto the icon size: circle r=8 → disc of diameter 20', () => {
    const icon = fx('bi:circle-fill');
    expect(icon).toMatchObject({ width: 16, height: 16, left: 0, top: 0 });
    const s = iconToShape(icon, 20);
    const b = bounds(s)!;
    expect(b.minX).toBeCloseTo(0, 1); expect(b.maxX).toBeCloseTo(20, 1);
    expect(b.minY).toBeCloseTo(0, 1); expect(b.maxY).toBeCloseTo(20, 1);
    expect(area(s)).toBeCloseTo(Math.PI * 100, 0);
  });

  it('keeps the aspect ratio of non-square icons (fa6-solid:cat is 576×512)', () => {
    const icon = fx('fa6-solid:cat');
    expect(icon.width).toBe(576);
    expect(icon.height).toBe(512);
    const b = bounds(iconToShape(icon, 18))!;
    expect(b.maxX).toBeLessThanOrEqual(18.01);
    expect(b.maxY).toBeLessThanOrEqual(16.01);
    // échelle prise sur la largeur 576 : la hauteur pleine (512) donne 16 mm, pas 18
    expect(b.maxY - b.minY).toBeCloseTo(16, 0);
  });

  it('honours left/top of the viewBox', () => {
    const s = iconToShape({ body: '<path d="M10 10h10v10h-10z"/>', left: 10, top: 10, width: 10, height: 10 }, 5);
    const b = bounds(s)!;
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
  });

  it('preserves evenodd holes (bi:arrow-down-circle ring)', () => {
    const s = iconToShape(fx('bi:arrow-down-circle'), 16);
    expect(holes(s).length).toBeGreaterThanOrEqual(1);
    // anneau r 7→8 + flèche : bien moins que le disque plein
    expect(area(s)).toBeLessThan(Math.PI * 64 * 0.5);
  });

  it('evenodd vs nonzero with same-winding nested squares', () => {
    const d = 'M0 0h24v24H0zM6 6h12v12H6z';
    expect(area(iconToShape(box(`<path d="${d}"/>`), 24))).toBeCloseTo(576, 0);
    expect(area(iconToShape(box(`<path fill-rule="evenodd" d="${d}"/>`), 24))).toBeCloseTo(576 - 144, 0);
    expect(area(iconToShape(box(`<g fill-rule="evenodd"><path d="${d}"/></g>`), 24))).toBeCloseTo(576 - 144, 0);
  });

  it('ignores the invisible bounding rect inside <g fill="none"> (MingCute source layout)', () => {
    const real = fx('mingcute:music-fill');
    const d = /\sd="([^"]+)"/.exec(real.body)![1];
    const wrapped = box(`<g fill="none"><path d="M24 0v24H0V0z"/><path fill="currentColor" fill-rule="evenodd" d="${d}" clip-rule="evenodd"/></g>`);
    const a = iconToShape(real, 24);
    const b = iconToShape(wrapped, 24);
    expect(area(b)).toBeCloseTo(area(a), 1);
    expect(area(b)).toBeLessThan(576 * 0.6);
  });

  it('skips partial-opacity duotone layers', () => {
    const duo = iconToShape(fx('ph:heart-duotone'), 20);
    const full = iconToShape(fx('ph:heart-fill'), 20);
    expect(holes(duo).length).toBeGreaterThanOrEqual(1);
    expect(area(duo)).toBeLessThan(area(full) * 0.6);
    const two = fx('ant-design:account-book-twotone');
    const opaque = { ...two, body: two.body.replace(/ fill-opacity="[^"]*"/g, '') };
    expect(area(iconToShape(two, 20))).toBeLessThan(area(iconToShape(opaque, 20)));
  });

  it('skips fully transparent and hidden elements', () => {
    const square = '<path d="M0 0h12v12H0z"/>';
    for (const hidden of ['opacity="0"', 'fill-opacity="0"', 'fill="none"', 'style="fill:none"', 'display="none"']) {
      expect(area(iconToShape(box(`${square}<path ${hidden} d="M12 12h12v12H12z"/>`), 24))).toBeCloseTo(144, 0);
    }
  });

  it('skips <defs>, <mask> and <clipPath> contents', () => {
    const body = '<defs><path d="M0 0h24v24H0z"/></defs><mask id="m"><rect width="24" height="24" fill="#fff"/></mask>'
      + '<clipPath id="c"><path d="M0 0h24v24H0z"/></clipPath><path d="M0 0h6v6H0z"/>';
    expect(area(iconToShape(box(body), 24))).toBeCloseTo(36, 0);
  });

  it('supports circle, ellipse, rect (with rx/ry), polygon and filled polyline', () => {
    expect(area(iconToShape(box('<circle cx="12" cy="12" r="10"/>'), 24))).toBeCloseTo(Math.PI * 100, 0);
    expect(area(iconToShape(box('<ellipse cx="12" cy="12" rx="10" ry="5"/>'), 24))).toBeCloseTo(Math.PI * 50, 0);
    expect(area(iconToShape(box('<rect x="2" y="2" width="20" height="10"/>'), 24))).toBeCloseTo(200, 0);
    // coins arrondis r=2 : 200 − (4 − π)·4
    expect(area(iconToShape(box('<rect x="2" y="2" width="20" height="10" rx="2"/>'), 24))).toBeCloseTo(200 - (4 - Math.PI) * 4, 0);
    // ry seul vaut aussi pour rx, chacun borné à la demi-dimension → ellipse 20×10
    expect(area(iconToShape(box('<rect width="20" height="10" ry="99"/>'), 24))).toBeCloseTo(Math.PI * 50, 0);
    expect(area(iconToShape(box('<polygon points="0,0 10,0 0,10"/>'), 24))).toBeCloseTo(50, 0);
    expect(area(iconToShape(box('<polyline points="0 0 10 0 0 10"/>'), 24))).toBeCloseTo(50, 0);
    expect(() => iconToShape(box('<polyline fill="none" stroke="#000" points="0 0 10 0 0 10"/>'), 24)).toThrow('Icône non prise en charge');
  });

  it('rejects transforms', () => {
    expect(() => iconToShape(fx('bi:align-top'), 20)).toThrow('Icône non prise en charge');
    expect(() => iconToShape(box('<g transform="scale(2)"><path d="M0 0h1v1H0z"/></g>'), 20)).toThrow(/transform/);
  });

  it('rejects stroke-only icons (nothing to cut)', () => {
    expect(() => iconToShape(fx('mingcute:ad-circle-line'), 20)).toThrow('Icône non prise en charge');
  });

  it('rejects unsupported elements such as <use>', () => {
    expect(() => iconToShape(box('<path d="M0 0h1v1H0z"/><use href="#a"/>'), 20)).toThrow('Icône non prise en charge');
  });
});
