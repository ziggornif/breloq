import { toShape } from './clip';
import { SCALE, type PathCommand, type Shape } from './types';

type Pt = { x: number; y: number };

/** Aplatit des commandes (mm) en contours fermés (µm). segLen = longueur max visée d'un segment, en mm. */
export function flattenCommands(cmds: PathCommand[], segLen = 0.2): Shape {
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let last: Pt = { x: 0, y: 0 };

  const flush = () => {
    if (cur.length > 1) {
      const a = cur[0];
      const b = cur[cur.length - 1];
      if (a.x === b.x && a.y === b.y) cur.pop();
    }
    if (cur.length >= 3) contours.push(cur);
    cur = [];
  };

  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        flush();
        last = { x: c.x, y: c.y };
        cur.push(last);
        break;
      case 'L':
        last = { x: c.x, y: c.y };
        cur.push(last);
        break;
      case 'Q': {
        const p0 = last;
        const n = steps([p0, { x: c.x1, y: c.y1 }, { x: c.x, y: c.y }], segLen);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          cur.push({
            x: u * u * p0.x + 2 * u * t * c.x1 + t * t * c.x,
            y: u * u * p0.y + 2 * u * t * c.y1 + t * t * c.y,
          });
        }
        last = { x: c.x, y: c.y };
        break;
      }
      case 'C': {
        const p0 = last;
        const n = steps([p0, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }], segLen);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          cur.push({
            x: u * u * u * p0.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            y: u * u * u * p0.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          });
        }
        last = { x: c.x, y: c.y };
        break;
      }
      case 'Z':
        flush();
        break;
    }
  }
  flush();

  return toShape(
    contours.map((pts) => pts.map((pt) => ({ x: Math.round(pt.x * SCALE), y: Math.round(pt.y * SCALE) }))),
  );
}

function steps(ctrl: Pt[], segLen: number): number {
  let len = 0;
  for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].y - ctrl[i - 1].y);
  return Math.min(64, Math.max(2, Math.ceil(len / segLen)));
}
