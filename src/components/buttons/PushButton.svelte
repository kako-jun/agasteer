<script lang="ts">
  import { _ } from '../../lib/i18n'
  import { isSaveGuideShown, dismissSaveGuide } from '../../lib/tour'
  import OctocatPushIcon from '../icons/OctocatPushIcon.svelte'

  export let onPush: () => void
  export let isDirty: boolean
  export let disabled: boolean = false
  /** 無効時の理由（クリックしたらトースト表示） */
  export let disabledReason: string = ''
  /** 無効時のクリックハンドラ */
  export let onDisabledClick: ((reason: string) => void) | null = null
  /** DOM ID（ツアー用） */
  export let id: string = ''

  // 初めてダーティになった時かつガイド未表示かつボタンが有効なら吹き出しを表示
  $: showGuide = isDirty && !isSaveGuideShown() && !disabled

  function handleClick() {
    if (disabled) {
      if (disabledReason && onDisabledClick) {
        onDisabledClick(disabledReason)
      }
    } else {
      dismissSaveGuide()
      onPush()
    }
  }

  function handleDismiss() {
    dismissSaveGuide()
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="push-button-wrapper" id={id || undefined} on:click={handleClick}>
  <button
    type="button"
    class="push-button"
    {disabled}
    title={$_('header.push')}
    aria-label={$_('header.push')}
  >
    <OctocatPushIcon />
  </button>
  {#if isDirty}
    <span class="notification-badge"></span>
  {/if}
  {#if showGuide}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="guide-tooltip" on:click|stopPropagation={handleDismiss}>
      <span class="guide-text">{$_('guide.saveToGitHub')}</span>
      <span class="guide-close">×</span>
    </div>
  {/if}
</div>

<style>
  .push-button-wrapper {
    position: relative;
  }

  .push-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  .push-button:hover:not(:disabled) {
    opacity: 0.7;
  }

  .push-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .push-button :global(svg) {
    width: 32px;
    height: 20px;
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

  .guide-tooltip {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 20px;
    padding: 8px 12px;
    background-color: var(--accent);
    color: var(--bg);
    border-radius: 6px;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  .guide-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    right: 12px;
    border: 5px solid transparent;
    border-top-color: var(--accent);
  }

  .guide-close {
    opacity: 0.8;
    font-size: 14px;
  }

  .guide-close:hover {
    opacity: 1;
  }
</style>
