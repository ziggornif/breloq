import earcut from 'earcut';
import { cleanPath, groupPolygons } from '../geometry/clip';
import { SCALE, type Path, type Shape } from '../geometry/types';

export interface Mesh {
  positions: number[];
  indices: number[];
}

/**
 * Extrude une forme 2D entre z0 et z1. Y SVG (vers le bas) devient −Y 3D.
 * Faces haut/bas triangulées par earcut sur les mêmes sommets que les murs → étanche.
 */
export function extrude(s: Shape, z0: number, z1: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const g of groupPolygons(s)) {
    // rings en coordonnées 3D (x, -y) entières µm ; outer CCW, holes CW vus de dessus
    const clean = (p: Path) => cleanPath(p).map((pt) => [pt.x, -pt.y] as [number, number]);
    if (clean(g.outer).length < 3) continue; // outer degenerate: drop group, never promote a hole
    const rings = [g.outer, ...g.holes]
      .map(clean)
      .filter((r) => r.length >= 3)
      .map((r, i) => (signedArea(r) > 0) === (i === 0) ? r : r.reverse());
    if (rings.length === 0 || signedArea(rings[0]) <= 0) continue;

    const flat: number[] = [];
    const holeIdx: number[] = [];
    for (let i = 0; i < rings.length; i++) {
      if (i > 0) holeIdx.push(flat.length / 2);
      for (const [x, y] of rings[i]) flat.push(x, y);
    }
    const n = flat.length / 2;
    const bottom = positions.length / 3;
    const top = bottom + n;
    for (let i = 0; i < n; i++) positions.push(flat[2 * i] / SCALE, flat[2 * i + 1] / SCALE, z0);
    for (let i = 0; i < n; i++) positions.push(flat[2 * i] / SCALE, flat[2 * i + 1] / SCALE, z1);

    const tris = earcut(flat, holeIdx.length ? holeIdx : null, 2);
    for (let i = 0; i < tris.length; i += 3) {
      let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
      if (triArea(flat, a, b, c) < 0) [b, c] = [c, b];
      indices.push(top + a, top + b, top + c);       // dessus, CCW vu de +Z
      indices.push(bottom + a, bottom + c, bottom + b); // dessous, inversé
    }

    let start = 0;
    for (const r of rings) {
      const len = r.length;
      for (let i = 0; i < len; i++) {
        const a = start + i;
        const b = start + ((i + 1) % len);
        indices.push(bottom + a, bottom + b, top + b);
        indices.push(bottom + a, top + b, top + a);
      }
      start += len;
    }
  }
  return { positions, indices };
}

export function mergeMeshes(...meshes: Mesh[]): Mesh {
  const out: Mesh = { positions: [], indices: [] };
  for (const m of meshes) {
    const o = out.positions.length / 3;
    for (const v of m.positions) out.positions.push(v);
    for (const i of m.indices) out.indices.push(i + o);
  }
  return out;
}

function signedArea(r: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function triArea(f: number[], a: number, b: number, c: number): number {
  return (f[2 * b] - f[2 * a]) * (f[2 * c + 1] - f[2 * a + 1])
    - (f[2 * c] - f[2 * a]) * (f[2 * b + 1] - f[2 * a + 1]);
}
