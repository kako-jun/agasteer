<script lang="ts">
  import { _ } from '../../lib/i18n'

  export let onExportZip: () => void
  export let exporting: boolean = false
</script>

<div class="export-section">
  <h3>{$_('settings.importExport.titleExport')}</h3>
  <p class="description">{$_('settings.importExport.description')}</p>

  <div class="actions">
    <button class="primary" type="button" on:click={onExportZip} disabled={exporting}>
      {exporting ? $_('settings.importExport.exporting') : $_('settings.importExport.exportZip')}
    </button>
  </div>
</div>

<style>
  .export-section {
    margin-top: 0;
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

  .primary {
    background: var(--surface-2);
    color: var(--text);
    border-color: var(--border);
  }

  .primary:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
