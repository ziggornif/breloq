<script lang="ts">
  import type { KeychainGeometry } from '../geometry/keychain';
  import { SCALE, type Shape } from '../geometry/types';

  let { geometry }: { geometry: KeychainGeometry } = $props();

  const PAD = 15;
  const GAP = 12;

  const toD = (s: Shape) =>
    s.map((p) => p.map((pt, i) => `${i ? 'L' : 'M'}${pt.x / SCALE} ${pt.y / SCALE}`).join('') + 'Z').join('');

  let baseD = $derived(toD(geometry.base));
  let lettersD = $derived(toD(geometry.letters));
  let w = $derived(geometry.width);
  let h = $derived(geometry.height);
  let vbW = $derived(w + PAD * 2);
  let vbH = $derived(h * 2 + GAP + PAD * 2 + 8);
  let ticks = $derived(Array.from({ length: Math.floor(w / 10) + 1 }, (_, i) => i * 10));
</script>

<svg class="preview" viewBox="{-PAD} {-PAD} {vbW} {vbH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Aperçu 2D du porte-clés">
  <defs>
    <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse">
      <path d="M5 0H0V5" fill="none" stroke="#e4e4e7" stroke-width="0.1" />
    </pattern>
    <pattern id="g25" width="25" height="25" patternUnits="userSpaceOnUse">
      <rect width="25" height="25" fill="url(#g5)" />
      <path d="M25 0H0V25" fill="none" stroke="#d4d4d8" stroke-width="0.2" />
    </pattern>
  </defs>
  <rect x={-PAD} y={-PAD} width={vbW} height={vbH} fill="url(#g25)" />

  <!-- graduations -->
  {#each ticks as t}
    <line x1={t} y1={-PAD} x2={t} y2={-PAD + 2} stroke="#a1a1aa" stroke-width="0.2" />
    <text x={t} y={-PAD + 4.5} font-size="2.4" fill="#71717a" text-anchor="middle">{t}</text>
  {/each}

  <!-- vue assemblée -->
  <path d={baseD} fill="none" style:stroke="var(--base)" stroke-width="0.3" fill-rule="evenodd" />
  <path d={lettersD} fill="none" style:stroke="var(--letters)" stroke-width="0.3" fill-rule="evenodd" />

  <!-- cotes -->
  <g stroke="#52525b" stroke-width="0.2" fill="#52525b" font-size="3">
    <line x1="0" y1={h + 3} x2={w} y2={h + 3} />
    <line x1="0" y1={h + 2} x2="0" y2={h + 4} />
    <line x1={w} y1={h + 2} x2={w} y2={h + 4} />
    <text x={w / 2} y={h + 7} text-anchor="middle" stroke="none">{w.toFixed(1)} mm</text>
    <line x1={w + 3} y1="0" x2={w + 3} y2={h} />
    <line x1={w + 2} y1="0" x2={w + 4} y2="0" />
    <line x1={w + 2} y1={h} x2={w + 4} y2={h} />
    <text x={w + 5} y={h / 2} dominant-baseline="middle" stroke="none">{h.toFixed(1)} mm</text>
  </g>

  <!-- couche lettres seule -->
  <g transform="translate(0 {h + GAP})">
    <path d={lettersD} fill="none" style:stroke="var(--base)" stroke-width="0.3" fill-rule="evenodd" />
  </g>
</svg>

<style>
  .preview { width: 100%; height: 100%; display: block; }
</style>
