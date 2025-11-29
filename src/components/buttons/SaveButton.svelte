<script lang="ts">
  import { _ } from '../../lib/i18n'
  import IconButton from './IconButton.svelte'
  import OctocatPushIcon from '../icons/OctocatPushIcon.svelte'

  export let onSave: () => void
  export let isDirty: boolean
  export let disabled: boolean = false
  /** 無効時の理由（クリックしたらトースト表示） */
  export let disabledReason: string = ''
  /** 無効時のクリックハンドラ */
  export let onDisabledClick: ((reason: string) => void) | null = null

  function handleClick() {
    if (disabled && disabledReason && onDisabledClick) {
      onDisabledClick(disabledReason)
    } else if (!disabled) {
      onSave()
    }
  }
</script>

<div class="save-button-wrapper">
  <!-- disabled時もクリックを検知するため、wrapperでクリックを受ける -->
  <div
    class="button-click-area"
    class:disabled
    on:click={handleClick}
    on:keydown={(e) => e.key === 'Enter' && handleClick()}
    role="button"
    tabindex={disabled ? 0 : -1}
  >
    <IconButton
      onClick={() => {}}
      title={disabled && disabledReason ? disabledReason : $_('common.save')}
      ariaLabel={$_('common.save')}
      variant="primary"
      iconWidth={32}
      iconHeight={20}
      {disabled}
    >
      <OctocatPushIcon />
    </IconButton>
  </div>
  {#if isDirty}
    <span class="notification-badge"></span>
  {/if}
</div>

<style>
  .save-button-wrapper {
    position: relative;
  }

  .button-click-area {
    display: contents;
  }

  .button-click-area.disabled {
    cursor: not-allowed;
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
