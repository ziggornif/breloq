import type { PathCommand } from './types';

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const SEPARATOR = /[\s,]/;

/**
 * Parse un attribut `d` SVG (M L H V C S Q T A Z, absolus et relatifs) en commandes
 * en coordonnées transformées `x * scale + dx`, `y * scale + dy`.
 * Les arcs sont convertis en cubiques, S/T en C/Q explicites.
 */
export function parseSvgPath(d: string, scale = 1, dx = 0, dy = 0): PathCommand[] {
  const out: PathCommand[] = [];
  const X = (x: number) => x * scale + dx;
  const Y = (y: number) => y * scale + dy;
  let pos = 0;
  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  // Dernier point de contrôle (coordonnées SVG) pour la réflexion de S / T.
  let lastC: { x: number; y: number } | null = null;
  let lastQ: { x: number; y: number } | null = null;
  // Après Z, le point courant revient au début du sous-chemin : une commande de tracé
  // sans M intermédiaire doit d'abord émettre un M explicite (flattenCommands ne démarre
  // un contour que sur M).
  let needsMove = false;

  const skip = () => {
    while (pos < d.length && SEPARATOR.test(d[pos])) pos++;
  };
  const fail = (): never => {
    throw new Error(`Malformed SVG path near position ${pos}`);
  };
  const num = () => {
    skip();
    NUMBER.lastIndex = pos;
    const m = NUMBER.exec(d);
    if (!m) fail();
    pos += m![0].length;
    return Number(m![0]);
  };
  // Les drapeaux d'arc font un seul caractère et peuvent être collés : « a1 1 0 1020 0 ».
  const flag = () => {
    skip();
    const c = d[pos];
    if (c !== '0' && c !== '1') fail();
    pos++;
    return c === '1';
  };
  const drawStart = () => {
    if (needsMove) {
      out.push({ type: 'M', x: X(sx), y: Y(sy) });
      needsMove = false;
    }
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    out.push({ type: 'C', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), x: X(x), y: Y(y) });
  };

  for (;;) {
    skip();
    if (pos >= d.length) break;
    const ch = d[pos];
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      pos++;
    } else if (cmd === '') {
      throw new Error(`Malformed SVG path near position ${pos}: expected a command`);
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    const upper = cmd.toUpperCase();
    let nextC: { x: number; y: number } | null = null;
    let nextQ: { x: number; y: number } | null = null;
    switch (upper) {
      case 'M': {
        cx = ox + num(); cy = oy + num(); sx = cx; sy = cy;
        out.push({ type: 'M', x: X(cx), y: Y(cy) });
        needsMove = false;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': drawStart(); cx = ox + num(); cy = oy + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'H': drawStart(); cx = ox + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'V': drawStart(); cy = oy + num(); out.push({ type: 'L', x: X(cx), y: Y(cy) }); break;
      case 'C':
      case 'S': {
        drawStart();
        let x1: number, y1: number;
        if (upper === 'C') {
          x1 = ox + num(); y1 = oy + num();
        } else {
          x1 = lastC ? 2 * cx - lastC.x : cx;
          y1 = lastC ? 2 * cy - lastC.y : cy;
        }
        const x2 = ox + num(), y2 = oy + num();
        cx = ox + num(); cy = oy + num();
        cubic(x1, y1, x2, y2, cx, cy);
        nextC = { x: x2, y: y2 };
        break;
      }
      case 'Q':
      case 'T': {
        drawStart();
        let x1: number, y1: number;
        if (upper === 'Q') {
          x1 = ox + num(); y1 = oy + num();
        } else {
          x1 = lastQ ? 2 * cx - lastQ.x : cx;
          y1 = lastQ ? 2 * cy - lastQ.y : cy;
        }
        cx = ox + num(); cy = oy + num();
        out.push({ type: 'Q', x1: X(x1), y1: Y(y1), x: X(cx), y: Y(cy) });
        nextQ = { x: x1, y: y1 };
        break;
      }
      case 'A': {
        drawStart();
        const rx = num(), ry = num(), rot = num();
        const large = flag(), sweep = flag();
        const x = ox + num(), y = oy + num();
        arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y, cubic, () => out.push({ type: 'L', x: X(x), y: Y(y) }));
        cx = x; cy = y;
        break;
      }
      case 'Z':
        cx = sx; cy = sy; out.push({ type: 'Z' }); needsMove = true;
        // Pas de répétition implicite après Z : un nombre suivant est une erreur.
        cmd = '';
        break;
      default: throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
    lastC = nextC;
    lastQ = nextQ;
  }
  return out;
}

/**
 * Arc elliptique SVG → cubiques (conversion extrémités → centre, SVG 1.1 annexe F.6.5),
 * par tranches d'au plus 90°. Rayon nul ou extrémités confondues : segment droit (ou rien).
 */
function arcToCubics(
  x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number,
  large: boolean, sweep: boolean, x2: number, y2: number,
  cubic: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => void,
  line: () => void,
): void {
  if (x1 === x2 && y1 === y2) return;
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) { line(); return; }

  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const hx = (x1 - x2) / 2, hy = (y1 - y2) / 2;
  const x1p = cos * hx + sin * hy;
  const y1p = -sin * hx + cos * hy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const seg = delta / n;
  const k = (4 / 3) * Math.tan(seg / 4);
  // point de l'ellipse (et dérivée) à l'angle t, dans le repère du dessin
  const pt = (t: number) => {
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    return { x: ccx + cos * ex - sin * ey, y: ccy + sin * ex + cos * ey };
  };
  const der = (t: number) => {
    const ex = -rx * Math.sin(t), ey = ry * Math.cos(t);
    return { x: cos * ex - sin * ey, y: sin * ex + cos * ey };
  };
  let t = theta1;
  for (let i = 0; i < n; i++) {
    const t2 = t + seg;
    const p0 = pt(t), d0 = der(t), d1 = der(t2);
    const p1 = i === n - 1 ? { x: x2, y: y2 } : pt(t2);
    cubic(p0.x + k * d0.x, p0.y + k * d0.y, p1.x - k * d1.x, p1.y - k * d1.y, p1.x, p1.y);
    t = t2;
  }
}
