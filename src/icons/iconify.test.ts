import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FIXTURES } from '../test/iconify-fixtures';

type Mod = typeof import('./iconify');
let mod: Mod;

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(async () => {
  vi.resetModules();
  mod = await import('./iconify');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeIconId', () => {
  it('reads legacy Remix names as ri:<name>', () => {
    expect(mod.normalizeIconId('emotion-laugh-fill')).toBe('ri:emotion-laugh-fill');
  });
  it('keeps valid prefix:name ids', () => {
    expect(mod.normalizeIconId('fa6-solid:cat')).toBe('fa6-solid:cat');
    expect(mod.normalizeIconId('game-icons:3d-glasses')).toBe('game-icons:3d-glasses');
  });
  it('rejects malformed ids', () => {
    for (const bad of ['', 'a:b:c', '../x', 'mdi:', ':x', 'mdi:Heart', 'mdi:he art', 'mdi:x?y']) {
      expect(mod.normalizeIconId(bad)).toBeNull();
    }
  });
});

describe('iconImageUrl', () => {
  it('points at the API SVG endpoint', () => {
    expect(mod.iconImageUrl('mdi:heart')).toBe('https://api.iconify.design/mdi/heart.svg');
  });
});

describe('searchIcons', () => {
  it('queries the API with the curated filled sets and returns ids', async () => {
    const fetch = vi.fn(async () => json({ icons: ['mdi:middleware', 'mingcute:middle-finger-fill'], total: 2 }));
    vi.stubGlobal('fetch', fetch);
    await expect(mod.searchIcons('  middl ')).resolves.toEqual(['mdi:middleware', 'mingcute:middle-finger-fill']);
    const url = new URL(fetch.mock.calls[0][0] as unknown as string);
    expect(url.origin + url.pathname).toBe('https://api.iconify.design/search');
    expect(url.searchParams.get('query')).toBe('middl');
    expect(url.searchParams.get('limit')).toBe('48');
    expect(url.searchParams.get('prefixes')).toBe(mod.ICON_PREFIXES.join(','));
  });

  it('drops stroke-only MingCute "-line" icons and malformed ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ icons: ['mingcute:heart-fill', 'mingcute:heart-line', 'ri:heart-line', 'bad id'] })));
    await expect(mod.searchIcons('heart')).resolves.toEqual(['mingcute:heart-fill', 'ri:heart-line']);
  });

  it('passes the abort signal through', async () => {
    const fetch = vi.fn(async () => json({ icons: [] }));
    vi.stubGlobal('fetch', fetch);
    const ctrl = new AbortController();
    await mod.searchIcons('x', ctrl.signal);
    expect((fetch.mock.calls[0] as unknown[])[1]).toMatchObject({ signal: ctrl.signal });
  });

  it('rejects with a French message on HTTP or network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    await expect(mod.searchIcons('cat')).rejects.toThrow(/Recherche d'icônes impossible.*503/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(mod.searchIcons('cat')).rejects.toThrow(/Recherche d'icônes impossible/);
  });

  it('every category chip has a French label and a query', () => {
    expect(mod.ICON_CATEGORIES[0]).toEqual({ label: 'Emoji', query: 'face' });
    for (const c of mod.ICON_CATEGORIES) {
      expect(c.label).toBeTruthy();
      expect(c.query).toBeTruthy();
    }
  });
});

describe('loadIcon', () => {
  it('fetches the icon JSON and resolves the viewBox (root size)', async () => {
    const fetch = vi.fn(async () => json(FIXTURES['mdi:heart']));
    vi.stubGlobal('fetch', fetch);
    const icon = await mod.loadIcon('mdi:heart');
    expect(fetch.mock.calls[0][0]).toBe('https://api.iconify.design/mdi.json?icons=heart');
    expect(icon).toMatchObject({ left: 0, top: 0, width: 24, height: 24 });
    expect(icon.body).toContain('<path');
  });

  it('defaults to 16×16 and lets per-icon width override the root', () => {
    expect(mod.parseIconResponse(FIXTURES['bi:circle-fill'], 'circle-fill')).toMatchObject({ width: 16, height: 16 });
    expect(mod.parseIconResponse(FIXTURES['fa6-solid:cat'], 'cat')).toMatchObject({ width: 576, height: 512 });
    expect(mod.parseIconResponse({ icons: { a: { body: '<path/>', left: -2, top: 1 } } }, 'a')).toMatchObject({ left: -2, top: 1 });
  });

  it('caches successful loads per id', async () => {
    const fetch = vi.fn(async () => json(FIXTURES['mdi:heart']));
    vi.stubGlobal('fetch', fetch);
    const a = await mod.loadIcon('mdi:heart');
    const b = await mod.loadIcon('mdi:heart');
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts legacy names', async () => {
    const fetch = vi.fn(async () => json({ prefix: 'ri', width: 24, height: 24, icons: { 'emotion-laugh-fill': { body: '<path d="M0 0h1v1z"/>' } } }));
    vi.stubGlobal('fetch', fetch);
    await mod.loadIcon('emotion-laugh-fill');
    expect(fetch.mock.calls[0][0]).toBe('https://api.iconify.design/ri.json?icons=emotion-laugh-fill');
  });

  it('rejects unknown icons and malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ prefix: 'mdi', icons: {}, not_found: ['nope'] })));
    await expect(mod.loadIcon('mdi:nope')).rejects.toThrow('Icône introuvable : mdi:nope');
    vi.stubGlobal('fetch', vi.fn(async () => json('404', 404)));
    await expect(mod.loadIcon('zzz:a')).rejects.toThrow(/Chargement de l'icône zzz:a impossible.*404/);
    await expect(mod.loadIcon('../etc')).rejects.toThrow('Icône invalide');
  });

  it('does not cache rejections: a retry refetches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(mod.loadIcon('mdi:heart')).rejects.toThrow(/Chargement de l'icône mdi:heart impossible/);
    const fetch = vi.fn(async () => json(FIXTURES['mdi:heart']));
    vi.stubGlobal('fetch', fetch);
    await expect(mod.loadIcon('mdi:heart')).resolves.toMatchObject({ width: 24 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
