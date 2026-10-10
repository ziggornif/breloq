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

/**
 * Vignette locale (data URI) : construite à partir du corps déjà chargé, affichée via <img> —
 * le SVG tiers n'est jamais injecté dans la page et ne peut pas exécuter de script.
 */
export function iconDataUri(icon: IconSvg): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left} ${icon.top} ${icon.width} ${icon.height}" style="color:#3f3f46">${icon.body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

/**
 * Extrait une icône d'une réponse `/<prefix>.json?icons=<name>` (format IconifyJSON, taille par défaut 16).
 * Un nom peut être un alias (`aliases[name].parent`, éventuellement en chaîne) : on suit le parent, les
 * propriétés de l'alias l'emportent. Les alias qui retournent ou font pivoter l'icône ne sont pas gérés.
 */
export function parseIconResponse(data: unknown, name: string): IconSvg {
  const root = (data ?? {}) as Record<string, unknown>;
  const icons = (root.icons ?? {}) as Record<string, Record<string, unknown>>;
  const aliases = (root.aliases ?? {}) as Record<string, Record<string, unknown>>;
  const props: Record<string, unknown> = {};
  let current = name;
  for (let depth = 0; !icons[current]; depth++) {
    const alias = aliases[current];
    if (!alias || typeof alias.parent !== 'string' || depth > 8) {
      throw new Error(`Icône introuvable : ${String(root.prefix ?? '?')}:${name}`);
    }
    for (const [k, v] of Object.entries(alias)) if (k !== 'parent' && !(k in props)) props[k] = v;
    current = alias.parent;
  }
  const icon = { ...icons[current], ...props };
  if (typeof icon.body !== 'string') throw new Error(`Icône introuvable : ${String(root.prefix ?? '?')}:${name}`);
  if (icon.hFlip || icon.vFlip || icon.rotate) throw new Error(`Icône non prise en charge : ${String(root.prefix ?? '?')}:${name}`);
  return {
    body: icon.body,
    left: num(icon.left, num(root.left, 0)),
    top: num(icon.top, num(root.top, 0)),
    width: num(icon.width, num(root.width, 16)),
    height: num(icon.height, num(root.height, 16)),
  };
}

const cache = new Map<string, Promise<IconSvg>>();

/** `what` complète le message d'erreur : « Chargement <what> impossible ». */
async function fetchPrefix(prefix: string, names: string[], what: string): Promise<unknown> {
  const url = `${ICONIFY_API}/${prefix}.json?icons=${names.join(',')}`; // noms validés par normalizeIconId
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { prefix, ...((await res.json()) as object) };
  } catch (e) {
    throw new Error(`Chargement ${what} impossible (${(e as Error).message})`);
  }
}

/**
 * Charge plusieurs icônes en une requête par jeu (l'API limite le nombre d'appels : une requête
 * par vignette déclenche des 429). Remplit le cache de `loadIcon` ; les icônes absentes sont omises.
 */
export async function loadIcons(rawIds: string[]): Promise<Map<string, IconSvg>> {
  const out = new Map<string, IconSvg>();
  const missing = new Map<string, string[]>();
  for (const raw of rawIds) {
    const id = normalizeIconId(raw);
    if (!id) continue;
    const hit = cache.get(id);
    if (hit) { out.set(id, await hit); continue; }
    const [prefix, name] = split(id);
    missing.set(prefix, [...(missing.get(prefix) ?? []), name]);
  }
  await Promise.all([...missing].map(async ([prefix, names]) => {
    const data = await fetchPrefix(prefix, names, `des icônes ${prefix}`);
    for (const name of names) {
      try {
        const icon = parseIconResponse(data, name);
        cache.set(`${prefix}:${name}`, Promise.resolve(icon));
        out.set(`${prefix}:${name}`, icon);
      } catch { /* icône absente du lot : omise */ }
    }
  }));
  return out;
}

/** Charge le corps SVG d'une icône (mis en cache par id ; les échecs ne sont pas mis en cache). */
export function loadIcon(rawId: string): Promise<IconSvg> {
  const id = normalizeIconId(rawId);
  if (!id) return Promise.reject(new Error(`Icône invalide : ${rawId}`));
  let p = cache.get(id);
  if (!p) {
    const [prefix, name] = split(id);
    p = fetchPrefix(prefix, [name], `de l'icône ${id}`).then((data) => parseIconResponse(data, name));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
