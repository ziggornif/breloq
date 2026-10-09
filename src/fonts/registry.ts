import { parse, type Font } from 'opentype.js';
import '@fontsource/pacifico/400.css';
import '@fontsource/lobster/400.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/satisfy/400.css';
import '@fontsource/kaushan-script/400.css';
import '@fontsource/yellowtail/400.css';
import '@fontsource/cookie/400.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/righteous/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/titan-one/400.css';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource/chewy/400.css';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import lobster from '@fontsource/lobster/files/lobster-latin-400-normal.woff?url';
import dancing from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url';
import greatVibes from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';
import satisfy from '@fontsource/satisfy/files/satisfy-latin-400-normal.woff?url';
import kaushan from '@fontsource/kaushan-script/files/kaushan-script-latin-400-normal.woff?url';
import yellowtail from '@fontsource/yellowtail/files/yellowtail-latin-400-normal.woff?url';
import cookie from '@fontsource/cookie/files/cookie-latin-400-normal.woff?url';
import fredoka from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url';
import baloo from '@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff?url';
import righteous from '@fontsource/righteous/files/righteous-latin-400-normal.woff?url';
import bungee from '@fontsource/bungee/files/bungee-latin-400-normal.woff?url';
import titanOne from '@fontsource/titan-one/files/titan-one-latin-400-normal.woff?url';
import luckiest from '@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff?url';
import chewy from '@fontsource/chewy/files/chewy-latin-400-normal.woff?url';

export interface FontEntry {
  id: string;
  label: string;
  /** famille CSS pour l'aperçu dans la liste */
  family: string;
  url?: string;
  font?: Font;
}

export const FONTS: FontEntry[] = [
  { id: 'pacifico', label: 'Pacifico', family: 'Pacifico', url: pacifico },
  { id: 'lobster', label: 'Lobster', family: 'Lobster', url: lobster },
  { id: 'dancing-script', label: 'Dancing Script', family: 'Dancing Script', url: dancing },
  { id: 'great-vibes', label: 'Great Vibes', family: 'Great Vibes', url: greatVibes },
  { id: 'satisfy', label: 'Satisfy', family: 'Satisfy', url: satisfy },
  { id: 'kaushan-script', label: 'Kaushan Script', family: 'Kaushan Script', url: kaushan },
  { id: 'yellowtail', label: 'Yellowtail', family: 'Yellowtail', url: yellowtail },
  { id: 'cookie', label: 'Cookie', family: 'Cookie', url: cookie },
  { id: 'fredoka', label: 'Fredoka', family: 'Fredoka', url: fredoka },
  { id: 'baloo-2', label: 'Baloo 2', family: 'Baloo 2', url: baloo },
  { id: 'righteous', label: 'Righteous', family: 'Righteous', url: righteous },
  { id: 'bungee', label: 'Bungee', family: 'Bungee', url: bungee },
  { id: 'titan-one', label: 'Titan One', family: 'Titan One', url: titanOne },
  { id: 'luckiest-guy', label: 'Luckiest Guy', family: 'Luckiest Guy', url: luckiest },
  { id: 'chewy', label: 'Chewy', family: 'Chewy', url: chewy },
];

const custom: FontEntry[] = [];
const cache = new Map<string, Promise<Font>>();

export function listFonts(): FontEntry[] {
  return [...FONTS, ...custom];
}

export function loadFont(id: string): Promise<Font> {
  const entry = listFonts().find((f) => f.id === id);
  if (!entry) return Promise.reject(new Error(`Police inconnue : ${id}`));
  if (entry.font) return Promise.resolve(entry.font);
  let p = cache.get(id);
  if (!p) {
    p = fetch(entry.url!)
      .then((r) => {
        if (!r.ok) throw new Error(`Téléchargement de la police impossible (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => parse(buf));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export async function importFont(file: File): Promise<FontEntry> {
  let font: Font;
  try {
    font = parse(await file.arrayBuffer());
  } catch {
    throw new Error(`« ${file.name} » n'est pas une police TTF/OTF/WOFF valide`);
  }
  const name = file.name.replace(/\.(ttf|otf|woff)$/i, '');
  const entry: FontEntry = { id: `custom:${name}`, label: `${name} (importée)`, family: 'inherit', font };
  const i = custom.findIndex((f) => f.id === entry.id);
  if (i >= 0) custom[i] = entry; else custom.push(entry);
  return entry;
}
