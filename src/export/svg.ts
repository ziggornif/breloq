import { SCALE, type Shape } from '../geometry/types';

const n = (v: number) => String(+v.toFixed(3));

/** Données `d` en mm, un sous-chemin fermé par contour, décalé de dy mm. */
function pathData(s: Shape, dy = 0): string {
  return s
    .filter((p) => p.length >= 3)
    .map((p) => p.map((pt, i) => `${i ? 'L' : 'M'}${n(pt.x / SCALE)} ${n(pt.y / SCALE + dy)}`).join('') + 'Z')
    .join('');
}

function svgDoc(width: number, height: number, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}">
${body}
</svg>
`;
}

/** SVG en mm, trait fin (découpe laser), un sous-chemin par contour. */
export function shapeToSvg(s: Shape, width: number, height: number, stroke = '#ff0000'): string {
  return svgDoc(width, height,
    `  <path d="${pathData(s)}" fill="none" fill-rule="evenodd" stroke="${stroke}" stroke-width="0.01"/>`);
}

const XTOOL_GAP = 10;

/**
 * Fichier unique pour xTool Studio (même convention que l'export Atomm) : base découpée avec
 * l'emplacement des lettres en marquage, puis les lettres découpées en dessous.
 * `data-processing-type` et les couleurs créent directement les couches Cut / Score.
 */
export function xtoolSvg(g: { base: Shape; letters: Shape; width: number; height: number }): string {
  const path = (d: string, type: 'VECTOR_CUTTING' | 'VECTOR_ENGRAVING') =>
    `  <path data-processing-type="${type}" d="${d}" fill="none" fill-rule="evenodd" stroke="${
      type === 'VECTOR_CUTTING' ? '#cc3333' : '#3333cc'}" stroke-width="0.1"/>`;
  return svgDoc(g.width, g.height * 2 + XTOOL_GAP, [
    path(pathData(g.base), 'VECTOR_CUTTING'),
    path(pathData(g.letters), 'VECTOR_ENGRAVING'),
    path(pathData(g.letters, g.height + XTOOL_GAP), 'VECTOR_CUTTING'),
  ].join('\n'));
}
