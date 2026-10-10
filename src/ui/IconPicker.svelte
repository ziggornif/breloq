<script lang="ts">
  import { ICON_CATEGORIES, iconImageUrl, searchIcons } from '../icons/iconify';

  let { selected, onselect, onclose }: {
    selected: string;
    onselect: (id: string) => void;
    onclose: () => void;
  } = $props();

  const SEARCH_DEBOUNCE_MS = 300;

  let query = $state('');
  let category = $state(ICON_CATEGORIES[0]);
  let results = $state<string[]>([]);
  let status = $state<'loading' | 'ok' | 'error'>('loading');
  let errorMsg = $state('');
  let attempt = $state(0);
  let searchEl = $state<HTMLInputElement | null>(null);

  $effect(() => { searchEl?.focus(); });

  // Recherche : saisie temporisée, puce immédiate ; la requête précédente est annulée.
  $effect(() => {
    const typed = query.trim();
    const q = typed || category.query;
    void attempt;
    const ctrl = new AbortController();
    status = 'loading';
    const t = setTimeout(() => {
      searchIcons(q, ctrl.signal)
        .then((r) => { results = r; status = 'ok'; })
        .catch((e: Error) => {
          if (ctrl.signal.aborted) return;
          errorMsg = e.message;
          status = 'error';
        });
    }, typed ? SEARCH_DEBOUNCE_MS : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  });

  const label = (id: string) => id.slice(id.indexOf(':') + 1).replace(/-(fill|solid|filled)$/, '');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- Le clic sur le fond est un confort souris ; l'équivalent clavier est Échap (svelte:window ci-dessus). -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onclose} role="presentation"></div>
<div class="picker" role="dialog" aria-modal="true" aria-label="Choisir une icône">
  <input class="search" type="search" placeholder="Rechercher des icônes… (en anglais)" aria-label="Rechercher des icônes"
    bind:value={query} bind:this={searchEl} />
  <div class="chips">
    {#each ICON_CATEGORIES as c (c.label)}
      <button class:on={!query.trim() && category === c} aria-pressed={!query.trim() && category === c}
        onclick={() => { query = ''; category = c; }}>
        {c.label}
      </button>
    {/each}
  </div>
  {#if status === 'error'}
    <div class="error" role="alert">
      <p>{errorMsg}</p>
      <button onclick={() => attempt++}>Réessayer</button>
    </div>
  {:else if status === 'loading' && results.length === 0}
    <p class="muted">Chargement…</p>
  {:else}
    <div class="grid" aria-busy={status === 'loading'}>
      {#each results as id (id)}
        <button class="icon" class:on={id === selected} title={id}
          onclick={() => { onselect(id); onclose(); }}>
          <img src={iconImageUrl(id)} alt={id} loading="lazy" width="36" height="36" />
          <span>{label(id)}</span>
        </button>
      {/each}
    </div>
    {#if status === 'ok' && results.length === 0}<p class="muted">Aucune icône.</p>{/if}
  {/if}
  <p class="credit">Icônes : <a href="https://iconify.design" target="_blank" rel="noopener noreferrer">Iconify</a></p>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: #0003; z-index: 10; }
  .picker { position: fixed; top: 5vh; right: 380px; width: 480px; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 14px; padding: 16px; z-index: 11; box-shadow: 0 10px 40px #0003; }
  .search { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 16px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .chips button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px; }
  .chips button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .grid[aria-busy='true'] { opacity: 0.6; }
  .icon { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 10px 4px; min-width: 0; }
  .icon.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .icon img { width: 36px; height: 36px; }
  .icon span { font-size: 11px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); }
  .error { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #b91c1c; }
  .error button { border: 1px solid var(--border); background: #fff; border-radius: 8px; padding: 6px 12px; }
  .credit { margin: 12px 0 0; font-size: 11px; color: var(--muted); text-align: right; }
</style>
