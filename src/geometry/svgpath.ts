import type { PathCommand } from './types';

const TOKEN = /([a-zA-Z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/**
 * Parse un attribut `d` SVG (M L H V C Q Z, absolus et relatifs) en commandes
 * en coordonnées transformées `x * scale + dx`, `y * scale + dy`.
 */
export function parseSvgPath(d: string, scale = 1, dx = 0, dy = 0): PathCommand[] {
  const tokens: (string | number)[] = [];
  for (const m of d.matchAll(TOKEN)) tokens.push(m[1] ?? Number(m[2]));

  const out: PathCommand[] = [];
  const X = (x: number) => x * scale + dx;
  const Y = (y: number) => y * scale + dy;
  let i = 0;
  let cmd = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  // Après Z, le point courant revient au début du sous-chemin : une commande de tracé
  // sans M intermédiaire doit d'abord émettre un M explicite (flattenCommands ne démarre
  // un contour que sur M).
  let needsMove = false;

  const num = () => {
    const t = tokens[i++];
    if (typeof t !== 'number') throw new Error(`Malformed SVG path near token ${i}`);
    return t;
  };
  const drawStart = () => {
    if (needsMove) {
      out.push({ type: 'M', x: X(sx), y: Y(sy) });
      needsMove = false;
    }
  };

  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') {
      cmd = tokens[i++] as string;
    } else if (cmd === '') {
      throw new Error(`Malformed SVG path near token ${i}: expected a command`);
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
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
      case 'C': {
        drawStart();
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num();
        cx = ox + num(); cy = oy + num();
        out.push({ type: 'C', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), x: X(cx), y: Y(cy) });
        break;
      }
      case 'Q': {
        drawStart();
        const x1 = ox + num(), y1 = oy + num();
        cx = ox + num(); cy = oy + num();
        out.push({ type: 'Q', x1: X(x1), y1: Y(y1), x: X(cx), y: Y(cy) });
        break;
      }
      case 'Z':
        cx = sx; cy = sy; out.push({ type: 'Z' }); needsMove = true;
        // Pas de répétition implicite après Z : un nombre suivant est une erreur.
        cmd = '';
        break;
      default: throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
  }
  return out;
}
