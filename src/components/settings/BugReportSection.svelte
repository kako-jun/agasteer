<script lang="ts">
  import { onMount } from 'svelte'
  import { _ } from '../../lib/i18n'
  import {
    readDiagEntries,
    clearDiagEntries,
    formatReport,
    summarize,
    summarizeUserAgent,
    type DiagEntry,
  } from '../../lib/diagnostics'

  // バグレポート用診断ログ（#317）。ログは端末内だけに保存され、コピーするまで外へ出ない。
  const appVersion = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'
  const device = summarizeUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '')

  let entries = $state<DiagEntry[]>([])
  let status = $state<'' | 'copied' | 'copyFailed' | 'cleared' | 'clearFailed'>('')
  let statusTimer: ReturnType<typeof setTimeout> | undefined

  const summary = $derived(summarize(entries))
  const report = $derived(formatReport(entries, { appVersion, device }))

  function fmt(ms: number | null): string {
    return ms === null ? '' : new Date(ms).toLocaleString()
  }

  async function reload() {
    entries = await readDiagEntries()
  }

  function flash(next: typeof status) {
    status = next
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => (status = ''), 3000)
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report)
      flash('copied')
    } catch {
      flash('copyFailed')
    }
  }

  async function clearLog() {
    const ok = await clearDiagEntries()
    await reload()
    flash(ok ? 'cleared' : 'clearFailed')
  }

  onMount(() => {
    void reload()
    return () => clearTimeout(statusTimer)
  })
</script>

<div class="bug-report">
  <h3>{$_('settings.bugReport.title')}</h3>
  <p class="description">{$_('settings.bugReport.description')}</p>

  <p class="meta">
    {#if summary.count === 0}
      {$_('settings.bugReport.summaryEmpty')}
    {:else}
      {$_('settings.bugReport.summary', {
        values: { count: summary.count, from: fmt(summary.from), to: fmt(summary.to) },
      })}
    {/if}
  </p>

  {#if summary.count > 0}
    <details class="preview-details">
      <summary>{$_('settings.bugReport.previewSummary')}</summary>
      <textarea
        id="bug-report-preview"
        class="preview"
        readonly
        rows="10"
        aria-label={$_('settings.bugReport.previewSummary')}
        value={report}
      ></textarea>
    </details>
  {/if}

  <div class="actions">
    <button class="primary" type="button" onclick={copyReport}>
      {$_('settings.bugReport.copy')}
    </button>
    <button class="primary" type="button" onclick={clearLog} disabled={summary.count === 0}>
      {$_('settings.bugReport.clear')}
    </button>
  </div>
  <p class="status" role="status" aria-live="polite">
    {#if status === 'copied'}{$_('settings.bugReport.copied')}{/if}
    {#if status === 'copyFailed'}{$_('settings.bugReport.copyFailed')}{/if}
    {#if status === 'cleared'}{$_('settings.bugReport.cleared')}{/if}
    {#if status === 'clearFailed'}{$_('settings.bugReport.clearFailed')}{/if}
  </p>
</div>

<style>
  .bug-report {
    margin-top: 0;
  }

  h3 {
    margin: 0 0 0.4rem 0;
    color: var(--text);
  }

  .description {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }

  .meta {
    margin: 0.2rem 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .preview-details {
    margin-top: 0.5rem;
  }

  .preview-details summary {
    cursor: pointer;
    color: var(--text);
    font-size: 0.9rem;
  }

  .preview-details .preview {
    margin-top: 0.4rem;
  }

  .preview {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem;
    background: var(--surface-1);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.75rem;
    line-height: 1.4;
    resize: vertical;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.75rem 0 0.3rem;
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
  }

  .status {
    min-height: 1.2em;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
