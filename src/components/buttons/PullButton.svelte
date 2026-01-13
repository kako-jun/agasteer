<script lang="ts">
  import { _ } from '../../lib/i18n'
  import OctocatPullIcon from '../icons/OctocatPullIcon.svelte'

  export let onPull: () => void
  export let disabled: boolean = false
  export let isStale: boolean = false
  /** Pull進捗情報 */
  export let progress: { percent: number; fetched: number; total: number } | null = null
  export let onProgressClick: () => void = () => {}
  /** DOM ID（ツアー用） */
  export let id: string = ''
</script>

<div class="pull-button-wrapper" id={id || undefined}>
  <div class="pull-button-inner">
    <button
      type="button"
      class="pull-button"
      on:click={onPull}
      {disabled}
      title={$_('header.pull')}
      aria-label={$_('header.pull')}
    >
      <OctocatPullIcon />
    </button>
    {#if progress !== null}
      <button class="pull-progress" on:click={onProgressClick}>{progress.percent}%</button>
    {/if}
  </div>
  {#if isStale}
    <span class="notification-badge" title={$_('header.staleRemote')}></span>
  {/if}
</div>

<style>
  .pull-button-wrapper {
    position: relative;
  }

  .pull-button-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.2rem 0.3rem;
    border-radius: 999px;
    gap: 0.25rem;
  }

  .pull-button {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.35rem;
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: background-color 0.2s;
  }

  .pull-button:hover:not(:disabled) {
    background: var(--surface-1);
  }

  .pull-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pull-button :global(svg) {
    width: 32px;
    height: 20px;
  }

  .pull-progress {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--accent);
    min-width: 2.5em;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    user-select: none;
  }

  .pull-progress:hover {
    background: var(--surface-2);
  }

  .notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    pointer-events: none;
  }
</style>
