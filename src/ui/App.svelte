<script lang="ts">
  import { untrack } from 'svelte';
  import type { Font } from 'opentype.js';
  import { DEFAULT_PARAMS, decodeParams, encodeParams, sanitize, type KeychainParams } from '../params';
  import { buildKeychain, type KeychainGeometry } from '../geometry/keychain';
  import { buildMeshes } from '../mesh/keychain3d';
  import { build3mf } from '../export/threemf';
  import { fileBaseName, laserZip } from '../export/bundle';
  import { download } from '../export/download';
  import { importFont, listFonts, loadFont, type FontEntry } from '../fonts/registry';
  import { loadIcons, type IconEntry } from '../icons/icons';
  import Panel from './Panel.svelte';
  import Preview2D from './Preview2D.svelte';

  const STORAGE_KEY = 'porte-cles-gen:params';

  function initialParams(): KeychainParams {
    const fromUrl = location.hash.length > 1 ? decodeParams(location.hash.slice(1)) : null;
    if (fromUrl) return fromUrl;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch { /* stockage indisponible */ }
    return { ...DEFAULT_PARAMS };
  }

  let params = $state<KeychainParams>(initialParams());
  let fonts = $state<FontEntry[]>(listFonts());
  let font = $state<Font | null>(null);
  let icons = $state<IconEntry[]>([]);
  let geometry = $state<KeychainGeometry | null>(null);
  let error = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let view = $state<'2d' | '3d'>('2d');
  let pickerOpen = $state(false);
  let lastGoodFontId = untrack(() => params.fontId);

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4000);
  }

  // police
  $effect(() => {
    const id = params.fontId;
    let cancelled = false;
    loadFont(id)
      .then((f) => { if (cancelled) return; font = f; lastGoodFontId = id; })
      .catch((e: Error) => {
        if (cancelled) return;
        notify(e.message);
        if (id !== lastGoodFontId) params.fontId = lastGoodFontId;
        else if (id !== DEFAULT_PARAMS.fontId) params.fontId = DEFAULT_PARAMS.fontId;
      });
    return () => { cancelled = true; };
  });

  // icônes (lazy)
  let iconsRequested = false;
  $effect(() => {
    if (params.iconEnabled && !iconsRequested) {
      iconsRequested = true;
      loadIcons()
        .then((l) => (icons = l))
        .catch((e: Error) => notify(`Chargement des icônes impossible : ${e.message}`));
    }
  });
  let iconPath = $derived(icons.find((i) => i.name === params.iconName)?.path);

  // géométrie (debounce)
  $effect(() => {
    const snapshot = sanitize($state.snapshot(params));
    const f = font;
    const ip = iconPath;
    const t = setTimeout(() => {
      if (!f) return;
      try {
        geometry = buildKeychain(snapshot, f, ip);
        error = null;
      } catch (e) {
        geometry = null;
        error = `Calcul impossible : ${(e as Error).message}`;
      }
    }, 100);
    return () => clearTimeout(t);
  });

  // persistance
  $effect(() => {
    const snapshot = sanitize($state.snapshot(params));
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* ignoré */ }
      const shareable = snapshot.fontId.startsWith('custom:') ? { ...snapshot, fontId: DEFAULT_PARAMS.fontId } : snapshot;
      history.replaceState(null, '', `#${encodeParams(shareable)}`);
    }, 300);
    return () => clearTimeout(t);
  });

  async function onimportfont(file: File) {
    try {
      const entry = await importFont(file);
      fonts = listFonts();
      params.fontId = entry.id;
    } catch (e) {
      notify((e as Error).message);
    }
  }

  function onexport() {
    if (!geometry) return;
    try {
      const name = fileBaseName(params.text);
      if (params.mode === 'laser') {
        download(laserZip(geometry), `${name}-laser.zip`, 'application/zip');
      } else {
        const m = buildMeshes(geometry, sanitize($state.snapshot(params)));
        download(build3mf([
          { name: 'base', color: params.baseColor, mesh: m.base },
          { name: 'lettres', color: params.lettersColor, mesh: m.letters },
        ]), `${name}.3mf`, 'model/3mf');
      }
    } catch (e) {
      notify(`Export impossible : ${(e as Error).message}`);
    }
  }
</script>

<main class="layout">
  <div class="stage">
    <div class="tabs">
      <button class:on={view === '2d'} onclick={() => (view = '2d')}>Aperçu 2D</button>
      <button class:on={view === '3d'} onclick={() => (view = '3d')}>Aperçu 3D</button>
    </div>
    {#if error}
      <p class="msg">{error}</p>
    {:else if !geometry}
      <p class="msg">Saisis un texte pour commencer.</p>
    {:else if view === '2d'}
      <Preview2D {geometry} />
    {:else}
      <p class="msg">Aperçu 3D (Task 14)</p>
    {/if}
    {#if geometry?.missing.length}
      <p class="warn">Caractères absents de la police, ignorés : {geometry.missing.join(' ')}</p>
    {/if}
  </div>

  <Panel bind:params {fonts} canExport={!!geometry}
    iconLabel={params.iconName.replace(/-fill$/, '')}
    {onexport} {onimportfont} onpickicon={() => (pickerOpen = true)} />

  {#if toast}<div class="toast">{toast}</div>{/if}
</main>

<style>
  .layout { display: flex; height: 100%; }
  .stage { flex: 1; position: relative; display: flex; flex-direction: column; padding: 56px 24px 24px; min-width: 0; }
  .tabs { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; background: #e4e4e7; border-radius: 10px; padding: 3px; z-index: 1; }
  .tabs button { border: 0; background: transparent; padding: 6px 14px; border-radius: 8px; color: var(--muted); }
  .tabs button.on { background: #fff; color: var(--text); }
  .msg { margin: auto; color: var(--muted); }
  .warn { position: absolute; bottom: 12px; left: 24px; color: #b45309; background: #fef3c7; padding: 6px 10px; border-radius: 6px; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #18181b; color: #fff; padding: 10px 16px; border-radius: 8px; }
</style>
