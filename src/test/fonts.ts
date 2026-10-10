import { readFileSync } from 'node:fs';
import { parse, type Font } from 'opentype.js';

export function loadTestFont(pkg = 'pacifico', file = 'pacifico-latin-400-normal.woff'): Font {
  const b = readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`);
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
