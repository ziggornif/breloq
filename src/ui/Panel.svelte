<script lang="ts">
  import type { KeychainParams } from '../params';
  import type { FontEntry } from '../fonts/registry';
  import NumberField from './NumberField.svelte';

  let {
    params = $bindable(), fonts, canExport, iconLabel, onexport, onimportfont, onpickicon,
  }: {
    params: KeychainParams;
    fonts: FontEntry[];
    canExport: boolean;
    iconLabel: string;
    onexport: () => void;
    onimportfont: (f: File) => void;
    onpickicon: () => void;
  } = $props();

  let fileInput: HTMLInputElement;
  let currentFamily = $derived(fonts.find((f) => f.id === params.fontId)?.family ?? 'inherit');
</script>

<aside class="panel">
  <section class="card">
    <h3>Nom</h3>
    <input class="text" bind:value={params.text} maxlength="40" />
  </section>

  <section class="card">
    <h3>Police</h3>
    <div class="row">
      <select bind:value={params.fontId} style:font-family={currentFamily}>
        {#each fonts as f (f.id)}
          <option value={f.id} style:font-family={f.family}>{f.label}</option>
        {/each}
      </select>
      <button class="ghost" onclick={() => fileInput.click()}>Importer</button>
      <input bind:this={fileInput} type="file" accept=".ttf,.otf,.woff" hidden
        onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onimportfont(f); e.currentTarget.value = ''; }} />
    </div>
    <NumberField label="Taille de police" bind:value={params.fontSize} step={0.5} min={5} max={200} />
    <NumberField label="Épaisseur du texte" bind:value={params.textWeight} min={0} max={5} />
    <NumberField label="Espacement des lettres" bind:value={params.letterSpacing} min={-10} max={20} />
    <NumberField label="Épaisseur du trait" bind:value={params.outlineWidth} min={0.5} max={15} />
  </section>

  <section class="card">
    <div class="head">
      <h3>Icône</h3>
      <input type="checkbox" class="toggle" bind:checked={params.iconEnabled} />
    </div>
    {#if params.iconEnabled}
      <button class="ghost wide" onclick={onpickicon}>{iconLabel} ›</button>
      <NumberField label="Taille" bind:value={params.iconSize} step={0.5} min={3} max={100} />
      <NumberField label="Espacement" bind:value={params.iconGap} min={0} max={30} />
    {/if}
  </section>

  <section class="card">
    <div class="head">
      <h3>Trou</h3>
      <input type="checkbox" class="toggle" bind:checked={params.holeEnabled} />
    </div>
    {#if params.holeEnabled}
      <div class="seg">
        {#each [['left', 'Gauche'], ['top', 'Haut'], ['right', 'Droite']] as [v, l]}
          <button class:on={params.holePosition === v} onclick={() => (params.holePosition = v as KeychainParams['holePosition'])}>{l}</button>
        {/each}
      </div>
      <NumberField label="Décalage" bind:value={params.holeOffset} step={0.5} min={-200} max={200} />
      <NumberField label="Diamètre" bind:value={params.holeDiameter} min={1} max={20} />
      <NumberField label="Marge" bind:value={params.holeMargin} min={0.5} max={15} />
    {/if}
  </section>

  <section class="card">
    <h3>Fabrication</h3>
    <div class="seg">
      <button class:on={params.mode === 'laser'} onclick={() => (params.mode = 'laser')}>Laser</button>
      <button class:on={params.mode === 'print3d'} onclick={() => (params.mode = 'print3d')}>Impression 3D</button>
    </div>
    {#if params.mode === 'print3d'}
      <NumberField label="Épaisseur de base" bind:value={params.baseThickness} min={0.6} max={20} />
      <NumberField label="Relief des lettres" bind:value={params.reliefHeight} min={0.2} max={20} />
      <NumberField label="Profondeur de poche" bind:value={params.pocketDepth} min={0} max={10} />
      <NumberField label="Jeu (0 = multi-matériau)" bind:value={params.clearance} step={0.05} min={0} max={1} />
      <label class="field">Couleur base <input type="color" bind:value={params.baseColor} /></label>
      <label class="field">Couleur lettres <input type="color" bind:value={params.lettersColor} /></label>
    {/if}
  </section>

  <div class="actions">
    <button class="primary" disabled={!canExport} onclick={onexport}>
      Exporter {params.mode === 'laser' ? '(2 SVG)' : '(3MF)'}
    </button>
  </div>
</aside>

<style>
  .panel { width: 360px; height: 100%; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--border); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; }
  h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .head h3 { margin: 0; }
  .text { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 18px; }
  .row { display: flex; gap: 8px; margin-bottom: 4px; }
  select { flex: 1; padding: 8px; border-radius: 8px; border: 0; background: #f4f4f5; font-size: 18px; }
  .ghost { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }
  .wide { width: 100%; text-align: left; margin: 8px 0; }
  .seg { display: flex; background: #f4f4f5; border-radius: 8px; padding: 3px; margin: 6px 0; }
  .seg button { flex: 1; border: 0; background: transparent; padding: 6px; border-radius: 6px; color: var(--muted); }
  .seg button.on { background: #fff; color: var(--text); box-shadow: 0 1px 2px #0002; }
  .field { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
  .toggle { width: 18px; height: 18px; }
  .actions { margin-top: auto; position: sticky; bottom: 0; background: var(--panel); padding-top: 8px; }
  .primary { width: 100%; padding: 12px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font-size: 16px; font-weight: 600; }
  .primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
