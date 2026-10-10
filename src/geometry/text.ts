import type { Font } from 'opentype.js';
import { emptyShape, union } from './clip';
import { flattenCommands } from './flatten';
import type { PathCommand, Shape } from './types';

export interface TextOptions {
  text: string;
  fontSize: number;
  letterSpacing: number;
}

export interface TextResult {
  shape: Shape;
  missing: string[];
}

export function textToShape(font: Font, o: TextOptions): TextResult {
  const missing = Array.from(new Set(
    Array.from(o.text).filter((ch) => ch.trim() !== '' && font.charToGlyphIndex(ch) === 0),
  ));
  if (o.text.trim() === '') return { shape: emptyShape(), missing };

  const glyphs = font.stringToGlyphs(o.text);
  const unit = o.fontSize / font.unitsPerEm;
  const all = emptyShape();
  let x = 0;
  glyphs.forEach((g, i) => {
    if (g.index !== 0) { // .notdef (glyphe absent) : ne pas dessiner le rectangle de remplacement
      const cmds = g.getPath(x, 0, o.fontSize).commands as unknown as PathCommand[];
      for (const p of flattenCommands(cmds)) all.push(p);
    }
    x += (g.advanceWidth ?? 0) * unit + o.letterSpacing;
    const next = glyphs[i + 1];
    if (next) x += font.getKerningValue(g, next) * unit;
  });
  return { shape: union(all), missing };
}
