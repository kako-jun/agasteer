<script lang="ts">
  import { _ } from '../../lib/i18n'
  import { isSaveGuideShown, dismissSaveGuide } from '../../lib/tour'
  import OctocatPushIcon from '../icons/OctocatPushIcon.svelte'

  interface Props {
    onPush: () => void
    isDirty: boolean
    disabled?: boolean
    disabledReason?: string
    onDisabledClick?: ((reason: string) => void) | null
    id?: string
  }

  let {
    onPush,
    isDirty,
    disabled = false,
    disabledReason = '',
    onDisabledClick = null,
    id = '',
  }: Props = $props()

  // 初めてダーティになった時かつガイド未表示かつボタンが有効なら吹き出しを表示
  let showGuide = $derived(isDirty && !isSaveGuideShown() && !disabled)

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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="push-button-wrapper" id={id || undefined} onclick={handleClick}>
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
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="guide-tooltip"
      onclick={(e) => {
        e.stopPropagation()
        handleDismiss()
      }}
    >
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

  .push-button:hover:not(:disabled) {
    background: var(--surface-1);
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
