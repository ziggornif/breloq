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

  // Passe 1 : contours de tous les groupes, orientés (outer CCW, trous CW vus de dessus).
  const groups: Ring[][] = [];
  for (const g of groupPolygons(s)) {
    // rings en coordonnées 3D (x, -y) entières µm
    const clean = (p: Path) => cleanPath(p).map((pt) => [pt.x, -pt.y] as Ring[number]);
    if (clean(g.outer).length < 3) continue; // outer degenerate: drop group, never promote a hole
    const rings = [g.outer, ...g.holes]
      .map(clean)
      .filter((r) => r.length >= 3)
      .map((r, i) => (signedArea(r) > 0) === (i === 0) ? r : r.reverse());
    if (rings.length === 0 || signedArea(rings[0]) <= 0) continue;
    groups.push(rings);
  }
  weldTJunctions(groups);

  // Passe 2 : triangulation et murs.
  for (const rings of groups) {
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

    const tris = splitCollinear(flat, earcut(flat, holeIdx.length ? holeIdx : null, 2));
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

type Ring = [number, number][];

/**
 * Un sommet d'un contour posé au milieu d'une arête d'un autre contour (îlot qui touche un trou,
 * ex. bouche d'un smiley) laisserait des arêtes ouvertes pour un slicer qui soude par position :
 * on insère ce sommet dans l'arête pour que les murs voisins partagent les mêmes extrémités.
 */
function weldTJunctions(groups: Ring[][]): void {
  const all = groups.flat();
  const pts = all.flat().sort((p, q) => p[0] - q[0]);
  for (const ring of all) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by), maxY = Math.max(ay, by);
      const on: [number, number][] = [];
      let lo = 0, hi = pts.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] < minX) lo = mid + 1; else hi = mid; }
      for (let k = lo; k < pts.length && pts[k][0] <= maxX; k++) {
        const q = pts[k];
        const [x, y] = q;
        if (y < minY || y > maxY) continue;
        if ((x === ax && y === ay) || (x === bx && y === by)) continue;
        if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) !== 0) continue;
        on.push(q);
      }
      if (on.length === 0) continue;
      const t = (q: [number, number]) => (q[0] - ax) * (bx - ax) + (q[1] - ay) * (by - ay);
      on.sort((p, q) => t(p) - t(q));
      const uniq = on.filter((q, k) => k === 0 || q[0] !== on[k - 1][0] || q[1] !== on[k - 1][1]);
      ring.splice(i + 1, 0, ...uniq.map((q) => [q[0], q[1]] as [number, number]));
      i += uniq.length;
    }
  }
}

/**
 * earcut peut tracer une arête de triangle par-dessus des sommets alignés (bouche d'un smiley :
 * deux trous dont les bords plats sont colinéaires). Les murs, eux, passent par ces sommets :
 * on subdivise les triangles pour que le dessus et les murs partagent les mêmes arêtes.
 */
function splitCollinear(flat: number[], tris: number[]): number[] {
  const n = flat.length / 2;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => flat[2 * a] - flat[2 * b]);
  const onEdge = (a: number, b: number): number[] => {
    const [ax, ay, bx, by] = [flat[2 * a], flat[2 * a + 1], flat[2 * b], flat[2 * b + 1]];
    const [minX, maxX, minY, maxY] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)];
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (flat[2 * order[mid]] < minX) lo = mid + 1; else hi = mid; }
    const found: number[] = [];
    for (let k = lo; k < n && flat[2 * order[k]] <= maxX; k++) {
      const w = order[k];
      const [x, y] = [flat[2 * w], flat[2 * w + 1]];
      if (y < minY || y > maxY || (x === ax && y === ay) || (x === bx && y === by)) continue;
      if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) === 0) found.push(w);
    }
    const t = (w: number) => (flat[2 * w] - ax) * (bx - ax) + (flat[2 * w + 1] - ay) * (by - ay);
    return found.sort((p, q) => t(p) - t(q));
  };

  const out: number[] = [];
  const todo: [number, number, number][] = [];
  for (let i = 0; i < tris.length; i += 3) todo.push([tris[i], tris[i + 1], tris[i + 2]]);
  while (todo.length) {
    const [a, b, c] = todo.pop()!;
    // première arête portant un sommet intermédiaire : éventail depuis le sommet opposé
    let split = false;
    for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const on = onEdge(u, v);
      if (on.length === 0) continue;
      const chain = [u, ...on, v];
      for (let k = 0; k + 1 < chain.length; k++) todo.push([chain[k], chain[k + 1], w]);
      split = true;
      break;
    }
    if (!split) out.push(a, b, c);
  }
  return out;
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

function signedArea(r: Ring): number {
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
