<script lang="ts">
  let {
    label, value = $bindable(), unit = 'mm', step = 0.1, min, max,
  }: { label: string; value: number; unit?: string; step?: number; min?: number; max?: number } = $props();
</script>

<label class="field">
  <span>{label}</span>
  <span class="input">
    <input type="number" bind:value {step} {min} {max} />
    <small>{unit}</small>
  </span>
</label>

<style>
  .field { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 0; }
  .input { display: flex; align-items: center; background: #f4f4f5; border-radius: 6px; padding: 4px 8px; }
  input { width: 70px; border: 0; background: transparent; text-align: right; }
  small { color: var(--muted); margin-left: 6px; }
</style>
