export interface IconEntry {
  name: string;
  category: string;
  path: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'User & Faces': 'Visages',
  'Health & Medical': 'Santé',
  'Game & Sports': 'Jeux & sports',
  Weather: 'Météo',
  Food: 'Nourriture',
  Map: 'Lieux',
  Buildings: 'Bâtiments',
  Media: 'Médias',
  Communication: 'Communication',
  Business: 'Business',
  Finance: 'Finance',
  Design: 'Design',
  Development: 'Dev',
  Device: 'Appareils',
  Document: 'Documents',
  Editor: 'Éditeur',
  Arrows: 'Flèches',
  System: 'Système',
  Others: 'Divers',
};

let cache: Promise<IconEntry[]> | null = null;

export function loadIcons(): Promise<IconEntry[]> {
  cache ??= import('./icons.json').then((m) => m.default as IconEntry[]);
  return cache;
}

export function filterIcons(icons: IconEntry[], query: string, category: string | null): IconEntry[] {
  const q = query.trim().toLowerCase();
  return icons.filter((i) => (!category || i.category === category) && (!q || i.name.includes(q)));
}
