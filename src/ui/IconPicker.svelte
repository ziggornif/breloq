<script lang="ts">
  import { CATEGORY_LABELS, filterIcons, type IconEntry } from '../icons/icons';

  let { icons, failed = false, selected, onselect, onclose }: {
    icons: IconEntry[];
    failed?: boolean;
    selected: string;
    onselect: (name: string) => void;
    onclose: () => void;
  } = $props();

  let query = $state('');
  let category = $state<string | null>('User & Faces');
  let categories = $derived([...new Set(icons.map((i) => i.category))]);
  let results = $derived(filterIcons(icons, query, query ? null : category).slice(0, 240));
  let searchEl = $state<HTMLInputElement | null>(null);

  $effect(() => { searchEl?.focus(); });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- Le clic sur le fond est un confort souris ; l'équivalent clavier est Échap (svelte:window ci-dessus). -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" onclick={onclose} role="presentation"></div>
<div class="picker" role="dialog" aria-modal="true" aria-label="Choisir une icône">
  <input class="search" placeholder="Rechercher des icônes… (en anglais)" bind:value={query} bind:this={searchEl} />
  <div class="chips">
    {#each categories as c (c)}
      <button class:on={!query && category === c} onclick={() => { query = ''; category = c; }}>
        {CATEGORY_LABELS[c] ?? c}
      </button>
    {/each}
  </div>
  {#if icons.length === 0}
    <p class="muted">{failed ? 'Chargement des icônes impossible' : 'Chargement…'}</p>
  {:else}
    <div class="grid">
      {#each results as i (i.name)}
        <button class="icon" class:on={i.name === selected} title={i.name}
          onclick={() => { onselect(i.name); onclose(); }}>
          <svg viewBox="0 0 24 24"><path d={i.path} /></svg>
          <span>{i.name.replace(/-fill$/, '')}</span>
        </button>
      {/each}
    </div>
    {#if results.length === 0}<p class="muted">Aucune icône.</p>{/if}
  {/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; background: #0003; z-index: 10; }
  .picker { position: fixed; top: 5vh; right: 380px; width: 480px; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 14px; padding: 16px; z-index: 11; box-shadow: 0 10px 40px #0003; }
  .search { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; font-size: 16px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .chips button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px; }
  .chips button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .icon { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 10px 4px; }
  .icon.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .icon svg { width: 36px; height: 36px; fill: #3f3f46; }
  .icon span { font-size: 11px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); }
</style>
