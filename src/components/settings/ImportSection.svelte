<script lang="ts">
  import { _ } from '../../lib/i18n'

  export let onImport: () => void
  export let importing: boolean = false
  export let supportedLabel: string = ''
</script>

<div class="import-section">
  <h3>{$_('settings.importExport.titleImport')}</h3>
  <p class="description">{$_('settings.importExport.importDescription')}</p>

  <div class="actions">
    <button class="secondary" type="button" on:click={onImport} disabled={importing}>
      {importing ? $_('settings.importExport.importing') : $_('settings.importExport.import')}
    </button>
    {#if supportedLabel}
      <span class="supported">{supportedLabel}</span>
    {/if}
  </div>

  <p class="note">{$_('settings.importExport.importNote')}</p>
</div>

<style>
  .import-section {
    margin-top: 1.25rem;
  }

  h3 {
    margin: 0 0 0.4rem 0;
    color: var(--text);
  }

  .description {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.6rem;
  }

  .supported {
    color: var(--text-muted);
    font-size: 0.85rem;
    align-self: center;
  }

  button {
    padding: 0.6rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary {
    background: var(--surface-2);
    color: var(--text);
  }

  .secondary:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
