import { union, unionEvenOdd } from './clip';
import { flattenCommands } from './flatten';
import { parseSvgPath } from './svgpath';
import type { Shape } from './types';

/** Corps SVG d'une icône (contenu de `<svg>`, sans la balise) et sa viewBox. */
export interface IconSvg {
  body: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const unsupported = (why: string): never => {
  throw new Error(`Icône non prise en charge (${why})`);
};

/** Éléments dont le contenu n'est jamais peint directement. */
const SKIP_CONTENT = new Set([
  'defs', 'mask', 'clippath', 'symbol', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'marker',
  'style', 'title', 'desc', 'metadata',
]);
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);

interface Ctx {
  skip: boolean;
  hidden: boolean;
  fill?: string;
  fillRule?: string;
  fillOpacity: number;
  opacity: number;
}

const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attributes(src: string): Record<string, string> {
  const a: Record<string, string> = {};
  for (const m of src.matchAll(ATTR)) a[m[1].toLowerCase()] = m[2] ?? m[3];
  // les déclarations `style` l'emportent sur les attributs de présentation
  if (a.style) {
    for (const decl of a.style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) a[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
    }
  }
  return a;
}

function len(v: string | undefined, def = 0): number {
  if (v === undefined || v.trim() === '') return def;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(px)?\s*$/.exec(v);
  if (!m) unsupported(`longueur « ${v} »`);
  return Number(m![1]);
}

function opacity(v: string | undefined): number {
  if (v === undefined) return 1;
  const pct = v.trim().endsWith('%');
  const n = len(pct ? v.trim().slice(0, -1) : v);
  return Math.min(1, Math.max(0, pct ? n / 100 : n));
}

/** Géométrie d'un élément de forme, en attribut `d` (unités de la viewBox), ou null si vide. */
function shapeToD(tag: string, a: Record<string, string>): string | null {
  switch (tag) {
    case 'path':
      return a.d ?? null;
    case 'circle':
    case 'ellipse': {
      const cx = len(a.cx), cy = len(a.cy);
      const rx = tag === 'circle' ? len(a.r) : len(a.rx, a.ry !== undefined ? len(a.ry) : 0);
      const ry = tag === 'circle' ? rx : len(a.ry, a.rx !== undefined ? len(a.rx) : 0);
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'rect': {
      const x = len(a.x), y = len(a.y), w = len(a.width), h = len(a.height);
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx !== undefined ? len(a.rx) : a.ry !== undefined ? len(a.ry) : 0;
      let ry = a.ry !== undefined ? len(a.ry) : rx;
      rx = Math.min(Math.max(0, rx), w / 2);
      ry = Math.min(Math.max(0, ry), h / 2);
      if (rx === 0 || ry === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      const arc = (dx: number, dy: number) => `a${rx} ${ry} 0 0 1 ${dx} ${dy}`;
      return `M${x + rx} ${y}h${w - 2 * rx}${arc(rx, ry)}v${h - 2 * ry}${arc(-rx, ry)}`
        + `h${-(w - 2 * rx)}${arc(-rx, -ry)}v${-(h - 2 * ry)}${arc(rx, -ry)}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const n = (a.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map((v) => len(v));
      if (n.length < 6) return null;
      return `M${n.slice(0, 2).join(' ')}L${n.slice(2, n.length - (n.length % 2)).join(' ')}Z`;
    }
    default:
      return null; // line : pas de surface
  }
}

/**
 * Convertit le corps SVG d'une icône en forme pleine (mm), la viewBox (left, top, width, height)
 * étant ramenée à `size` sur sa plus grande dimension, origine en (0, 0).
 * Pas de DOM : petit lecteur de balises suffisant pour les jeux Iconify « pleins ».
 * Ignorés : éléments invisibles (fill none, opacité nulle ou partielle — calques duotone),
 * contenu de defs/mask/clipPath. Refusés : transform, use, image, text…
 */
export function iconToShape(icon: IconSvg, size: number): Shape {
  const k = size / Math.max(icon.width, icon.height);
  const body = icon.body.replace(/<!--[\s\S]*?-->/g, '');
  const stack: Ctx[] = [{ skip: false, hidden: false, fillOpacity: 1, opacity: 1 }];
  const parts: Shape[] = [];

  for (const m of body.matchAll(TAG)) {
    const [, closing, rawTag, attrSrc, selfClosing] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    let ctx: Ctx;
    if (parent.skip || SKIP_CONTENT.has(tag)) {
      ctx = { ...parent, skip: true };
    } else {
      if (tag !== 'g' && !SHAPES.has(tag)) unsupported(`élément <${rawTag}>`);
      const a = attributes(attrSrc);
      if (a.transform !== undefined) unsupported('transform');
      ctx = {
        skip: false,
        hidden: parent.hidden || a.display === 'none' || a.visibility === 'hidden',
        fill: a.fill ?? parent.fill,
        fillRule: a['fill-rule'] ?? parent.fillRule,
        fillOpacity: a['fill-opacity'] !== undefined ? opacity(a['fill-opacity']) : parent.fillOpacity,
        opacity: parent.opacity * opacity(a.opacity),
      };
      if (SHAPES.has(tag)) {
        const fill = (ctx.fill ?? 'currentColor').trim().toLowerCase();
        const visible = !ctx.hidden && fill !== 'none' && fill !== 'transparent' && ctx.opacity * ctx.fillOpacity >= 1;
        const d = visible ? shapeToD(tag, a) : null;
        if (d) {
          const flat = flattenCommands(parseSvgPath(d, k, -icon.left * k, -icon.top * k));
          parts.push(ctx.fillRule?.trim() === 'evenodd' ? unionEvenOdd(flat) : union(flat));
        }
      }
    }
    if (!selfClosing) stack.push(ctx);
  }

  const shape = union(parts.flat());
  if (shape.length === 0) unsupported('aucune forme pleine à découper');
  return shape;
}
