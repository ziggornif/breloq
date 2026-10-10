import type { Font } from 'opentype.js';
import type { KeychainParams } from '../params';
import {
  area, bounds, circle, difference, intersect, offset, outerOnly, translate, union,
} from './clip';
import { iconToShape, type IconSvg } from './svgicon';
import { textToShape } from './text';
import type { Shape } from './types';

export interface KeychainGeometry {
  base: Shape;
  letters: Shape;
  width: number;
  height: number;
  missing: string[];
}

export function buildKeychain(p: KeychainParams, font: Font, icon?: IconSvg): KeychainGeometry | null {
  const t = textToShape(font, { text: p.text, fontSize: p.fontSize, letterSpacing: p.letterSpacing });
  let letters = t.shape;
  if (p.textWeight > 0 && letters.length) letters = offset(letters, p.textWeight / 2);

  if (p.iconEnabled && icon) {
    const tb = bounds(letters) ?? { minX: 0, maxX: 0, minY: -p.fontSize * 0.7, maxY: 0 };
    const shape = iconToShape(icon, p.iconSize);
    const ib = bounds(shape)!;
    const dx = tb.minX - p.iconGap - ib.maxX;
    const dy = (tb.minY + tb.maxY) / 2 - (ib.minY + ib.maxY) / 2;
    letters = union(letters, translate(shape, dx, dy));
  }
  if (letters.length === 0) return null;

  let base = outerOnly(offset(letters, p.outlineWidth));
  if (p.holeEnabled) base = addHole(base, p);

  const b = bounds(base)!;
  base = translate(base, -b.minX, -b.minY);
  letters = translate(letters, -b.minX, -b.minY);
  return { base, letters, width: b.maxX - b.minX, height: b.maxY - b.minY, missing: t.missing };
}

/** Ajoute une oreille percée, glissée vers la base jusqu'à recouvrir ~25 % du disque. */
function addHole(base: Shape, p: KeychainParams): Shape {
  const b = bounds(base)!;
  const r = p.holeDiameter / 2;
  const R = r + p.holeMargin;
  const target = 0.25 * Math.PI * R * R;
  const step = 0.25;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  let cx: number, cy: number, sx: number, sy: number;
  if (p.holePosition === 'top') {
    cx = clamp(midX + p.holeOffset, b.minX, b.maxX); cy = b.minY - r; sx = 0; sy = step;
  } else if (p.holePosition === 'right') {
    cx = b.maxX + r; cy = clamp(midY + p.holeOffset, b.minY, b.maxY); sx = -step; sy = 0;
  } else {
    cx = b.minX - r; cy = clamp(midY + p.holeOffset, b.minY, b.maxY); sx = step; sy = 0;
  }

  const maxIter = Math.ceil((b.maxX - b.minX + b.maxY - b.minY) / step);
  let best = { cx, cy, a: -1 };
  for (let i = 0; i < maxIter; i++) {
    const a = area(intersect(circle(cx, cy, R), base));
    if (a > best.a) best = { cx, cy, a };
    if (a >= target) break;
    cx += sx; cy += sy;
  }
  if (best.a < target) ({ cx, cy } = best);
  return difference(union(base, circle(cx, cy, R)), circle(cx, cy, r));
}
