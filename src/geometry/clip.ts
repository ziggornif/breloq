import * as ClipperNS from 'clipper-lib';
import { SCALE, type Bounds, type Path, type Pt, type Shape } from './types';

// clipper-lib est un module CommonJS : selon l'interop, l'API est sur le namespace ou sur `default`.
const CL = ((ClipperNS as unknown as { default?: typeof ClipperNS }).default ?? ClipperNS) as typeof ClipperNS;
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = CL;

/** Tolérance d'arc des offsets arrondis : 5 µm. */
const ARC_TOLERANCE = 5;

type CPath = ClipperNS.Path;
const toC = (p: Path): CPath => p.map((pt) => ({ X: pt.x, Y: pt.y }));
const fromC = (p: CPath): Path => p.map((pt) => ({ x: pt.X, y: pt.Y }));

export function makePath(coordsMm: number[]): Path {
  const p: Path = [];
  for (let i = 0; i + 1 < coordsMm.length; i += 2) {
    p.push({ x: Math.round(coordsMm[i] * SCALE), y: Math.round(coordsMm[i + 1] * SCALE) });
  }
  return p;
}

export function emptyShape(): Shape {
  return [];
}

export function toShape(paths: Path[]): Shape {
  return [...paths];
}

export function isOuter(p: Path): boolean {
  return Clipper.Orientation(toC(p));
}

function boolean(type: number, a: Shape, b: Shape): Shape {
  const c = new Clipper();
  c.AddPaths(a.map(toC), PolyType.ptSubject, true);
  if (b.length) c.AddPaths(b.map(toC), PolyType.ptClip, true);
  const out: CPath[] = [];
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out.map(fromC);
}

export function union(a: Shape, b: Shape = []): Shape {
  return boolean(ClipType.ctUnion, a, b);
}

export function difference(a: Shape, b: Shape): Shape {
  return boolean(ClipType.ctDifference, a, b);
}

export function intersect(a: Shape, b: Shape): Shape {
  return boolean(ClipType.ctIntersection, a, b);
}

/** Offset arrondi en mm (négatif = érosion). Résultat normalisé (union). */
export function offset(s: Shape, mm: number): Shape {
  const u = union(s);
  if (mm === 0 || u.length === 0) return u;
  const o = new ClipperOffset(2, ARC_TOLERANCE);
  o.AddPaths(u.map(toC), JoinType.jtRound, EndType.etClosedPolygon);
  const out: CPath[] = [];
  o.Execute(out, mm * SCALE);
  return union(out.map(fromC));
}

/** Garde uniquement les contours extérieurs (remplit les trous). */
export function outerOnly(s: Shape): Shape {
  return union(union(s).filter(isOuter));
}

export function circle(cx: number, cy: number, r: number, steps = 96): Shape {
  const p: Path = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    p.push({ x: Math.round((cx + r * Math.cos(a)) * SCALE), y: Math.round((cy + r * Math.sin(a)) * SCALE) });
  }
  return [isOuter(p) ? p : p.reverse()];
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  const ix = Math.round(dx * SCALE);
  const iy = Math.round(dy * SCALE);
  return s.map((p) => p.map((pt) => ({ x: pt.x + ix, y: pt.y + iy })));
}

/** Aire nette en mm² (extérieurs positifs, trous négatifs). */
export function area(s: Shape): number {
  let a = 0;
  for (const p of s) a += Clipper.Area(toC(p));
  return a / (SCALE * SCALE);
}

export function bounds(s: Shape): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of s) for (const pt of p) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (minX === Infinity) return null;
  return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE };
}

/** Supprime doublons consécutifs et points colinéaires (indispensable avant earcut). */
export function cleanPath(p: Path): Path {
  return fromC(Clipper.CleanPolygon(toC(p), 1.415));
}

/** Regroupe chaque contour extérieur avec ses trous directs (pour la triangulation). */
export function groupPolygons(s: Shape): { outer: Path; holes: Path[] }[] {
  const absArea = (p: Path) => Math.abs(Clipper.Area(toC(p)));
  const groups = s.filter(isOuter)
    .map((outer) => ({ outer, holes: [] as Path[], a: absArea(outer) }))
    .sort((x, y) => x.a - y.a);
  for (const h of s.filter((p) => !isOuter(p))) {
    const ha = absArea(h);
    // le plus petit extérieur plus grand que le trou qui contient un sommet du trou
    const owner = groups.find((g) => g.a > ha && h.some((pt) => inside(pt, g.outer)));
    owner?.holes.push(h);
  }
  return groups.map(({ outer, holes }) => ({ outer, holes }));
}

/** Point strictement intérieur ou sur le bord (sommet de trou sur le contour = possédé). */
function inside(pt: Pt, poly: Path): boolean {
  return Clipper.PointInPolygon({ X: pt.x, Y: pt.y }, toC(poly)) !== 0;
}
