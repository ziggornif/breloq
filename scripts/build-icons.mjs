import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'node_modules/remixicon/icons';
const out = [];
for (const category of readdirSync(root).sort()) {
  if (category === 'Logos') continue;
  for (const file of readdirSync(join(root, category)).sort()) {
    if (!file.endsWith('-fill.svg')) continue;
    const svg = readFileSync(join(root, category, file), 'utf8');
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (paths.length !== 1) continue;
    out.push({ name: file.replace(/\.svg$/, ''), category, path: paths[0] });
  }
}
mkdirSync('src/icons', { recursive: true });
writeFileSync('src/icons/icons.json', JSON.stringify(out));
console.log(`icons.json: ${out.length} icons`);
