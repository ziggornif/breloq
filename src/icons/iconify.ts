import type { IconSvg } from '../geometry/svgicon';

/** Client de l'API Iconify (https://iconify.design/docs/api/). Seules les icônes nécessitent le réseau. */
export const ICONIFY_API = 'https://api.iconify.design';

/** Jeux d'icônes pleines (découpables), par ordre de préférence. */
export const ICON_PREFIXES = ['mdi', 'fa6-solid', 'game-icons', 'mingcute', 'ri', 'bi', 'ant-design', 'material-symbols'] as const;

/** Puces de catégorie : recherches prédéfinies. */
export const ICON_CATEGORIES: readonly { label: string; query: string }[] = [
  { label: 'Emoji', query: 'face' },
  { label: 'Animaux', query: 'paw' },
  { label: 'Nature', query: 'leaf' },
  { label: 'Bébé', query: 'baby' },
  { label: 'Musique', query: 'music' },
  { label: 'Amour', query: 'heart' },
  { label: 'Météo', query: 'weather' },
  { label: 'Astro', query: 'zodiac' },
  { label: 'Sports', query: 'sport' },
  { label: 'Nourriture', query: 'food' },
  { label: 'Fête', query: 'cake' },
  { label: 'Formes', query: 'shape' },
];

export const SEARCH_LIMIT = 48;

const PART = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** « prefix:name » validé ; un nom sans préfixe (ancien lien Remix) est lu comme `ri:<name>`. */
export function normalizeIconId(raw: string): string | null {
  const parts = raw.split(':');
  if (parts.length === 1) parts.unshift('ri');
  if (parts.length !== 2 || !parts.every((p) => PART.test(p))) return null;
  return `${parts[0]}:${parts[1]}`;
}

function split(id: string): [string, string] {
  const i = id.indexOf(':');
  return [id.slice(0, i), id.slice(i + 1)];
}

export function iconImageUrl(id: string): string {
  const [prefix, name] = split(normalizeIconId(id) ?? id);
  return `${ICONIFY_API}/${prefix}/${name}.svg`;
}

/** Les « -line » MingCute sont des tracés de contour (stroke) : rien à découper. */
const isCuttable = (id: string) => !(id.startsWith('mingcute:') && id.endsWith('-line'));

export async function searchIcons(query: string, signal?: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ query: query.trim(), limit: String(SEARCH_LIMIT), prefixes: ICON_PREFIXES.join(',') });
  let data: unknown;
  try {
    const res = await fetch(`${ICONIFY_API}/search?${params}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(`Recherche d'icônes impossible (${(e as Error).message})`);
  }
  const icons = (data as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) throw new Error("Recherche d'icônes impossible (réponse invalide)");
  return icons.filter((i): i is string => typeof i === 'string' && normalizeIconId(i) === i && isCuttable(i));
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Extrait une icône d'une réponse `/<prefix>.json?icons=<name>` (format IconifyJSON, taille par défaut 16). */
export function parseIconResponse(data: unknown, name: string): IconSvg {
  const root = (data ?? {}) as Record<string, unknown>;
  const icon = (root.icons as Record<string, Record<string, unknown>> | undefined)?.[name];
  if (!icon || typeof icon.body !== 'string') throw new Error(`Icône introuvable : ${String(root.prefix ?? '?')}:${name}`);
  return {
    body: icon.body,
    left: num(icon.left, num(root.left, 0)),
    top: num(icon.top, num(root.top, 0)),
    width: num(icon.width, num(root.width, 16)),
    height: num(icon.height, num(root.height, 16)),
  };
}

const cache = new Map<string, Promise<IconSvg>>();

/** Charge le corps SVG d'une icône (mis en cache par id ; les échecs ne sont pas mis en cache). */
export function loadIcon(rawId: string): Promise<IconSvg> {
  const id = normalizeIconId(rawId);
  if (!id) return Promise.reject(new Error(`Icône invalide : ${rawId}`));
  let p = cache.get(id);
  if (!p) {
    const [prefix, name] = split(id);
    p = (async () => {
      let data: unknown;
      try {
        const res = await fetch(`${ICONIFY_API}/${prefix}.json?icons=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } catch (e) {
        throw new Error(`Chargement de l'icône ${id} impossible (${(e as Error).message})`);
      }
      return parseIconResponse({ prefix, ...(data as object) }, name);
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
