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

describe('parseIconResponse aliases', () => {
  const data = {
    prefix: 'mdi', width: 24, height: 24,
    icons: { emoticon: { body: '<path d="M0 0h1v1z"/>' } },
    aliases: { face: { parent: 'emoticon' }, smile: { parent: 'face', width: 32 }, flipped: { parent: 'emoticon', hFlip: true } },
  };
  it('resolves aliases (including chains) to their parent body, alias props overriding', () => {
    expect(mod.parseIconResponse(data, 'face')).toEqual({ body: '<path d="M0 0h1v1z"/>', left: 0, top: 0, width: 24, height: 24 });
    expect(mod.parseIconResponse(data, 'smile').width).toBe(32);
  });
  it('rejects aliases that flip or rotate (not supported)', () => {
    expect(() => mod.parseIconResponse(data, 'flipped')).toThrow('Icône non prise en charge');
  });
});

describe('iconDataUri', () => {
  it('builds a local SVG data URI from the icon body (no request per thumbnail)', () => {
    const uri = mod.iconDataUri({ body: '<path fill="currentColor" d="M0 0h4v4H0z"/>', left: 0, top: 0, width: 24, height: 24 });
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('<path fill="currentColor" d="M0 0h4v4H0z"/>');
  });
});

describe('loadIcons', () => {
  it('fetches one batch per prefix and fills the cache used by loadIcon', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const prefix = u.pathname.slice(1, -'.json'.length);
      const names = u.searchParams.get('icons')!.split(',');
      return json({ prefix, width: 24, height: 24, icons: Object.fromEntries(names.map((n) => [n, { body: `<path d="M0 0h1v1z" id="${n}"/>` }])) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const got = await mod.loadIcons(['mdi:heart', 'mdi:star', 'ri:ghost-fill']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
    expect(urls).toEqual([
      'https://api.iconify.design/mdi.json?icons=heart,star',
      'https://api.iconify.design/ri.json?icons=ghost-fill',
    ]);
    expect([...got.keys()].sort()).toEqual(['mdi:heart', 'mdi:star', 'ri:ghost-fill']);
    await mod.loadIcon('mdi:star');
    expect(fetchMock).toHaveBeenCalledTimes(2); // déjà en cache
  });

  it('omits icons missing from a batch and does not fail the others', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ prefix: 'mdi', icons: { heart: { body: '<path d="M0 0h1v1z"/>' } } })));
    const got = await mod.loadIcons(['mdi:heart', 'mdi:nope']);
    expect([...got.keys()]).toEqual(['mdi:heart']);
  });

  it('rejects when a batch request fails, without caching the failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 429)));
    await expect(mod.loadIcons(['mdi:heart'])).rejects.toThrow(/HTTP 429/);
    vi.stubGlobal('fetch', vi.fn(async () => json({ prefix: 'mdi', icons: { heart: { body: '<path d="M0 0h1v1z"/>' } } })));
    await expect(mod.loadIcon('mdi:heart')).resolves.toBeTruthy();
  });
});

describe('searchIcons', () => {
  it('queries the API with the curated filled sets and returns ids', async () => {
    const fetch = vi.fn(async () => json({ icons: ['mdi:middleware', 'mingcute:middle-finger-fill'], total: 2 }));
    vi.stubGlobal('fetch', fetch);
    await expect(mod.searchIcons('  middl ')).resolves.toEqual(['mdi:middleware', 'mingcute:middle-finger-fill']);
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
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
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe('https://api.iconify.design/mdi.json?icons=heart');
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
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe('https://api.iconify.design/ri.json?icons=emotion-laugh-fill');
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
