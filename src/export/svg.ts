import { SCALE, type Shape } from '../geometry/types';

const n = (v: number) => String(+v.toFixed(3));

/** SVG en mm, trait fin (découpe laser), un sous-chemin par contour. */
export function shapeToSvg(s: Shape, width: number, height: number, stroke = '#ff0000'): string {
  const d = s
    .filter((p) => p.length >= 3)
    .map((p) => p.map((pt, i) => `${i ? 'L' : 'M'}${n(pt.x / SCALE)} ${n(pt.y / SCALE)}`).join('') + 'Z')
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}">
  <path d="${d}" fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="0.01"/>
</svg>
`;
}
