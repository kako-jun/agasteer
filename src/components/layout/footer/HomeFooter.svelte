<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { notes } from '../../../lib/stores/stores'
  import { isTourShown, dismissTour } from '../../../lib/tour'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import PushButton from '../../buttons/PushButton.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'

  export let onCreateNote: (name: string) => void
  export let onPush: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let pushDisabled: boolean = false
  export let pushDisabledReason: string = ''
  export let onDisabledPushClick: ((reason: string) => void) | null = null
  /** 現在のワールド */
  export let currentWorld: WorldType = 'home'

  // ノートが0個かつガイド未表示なら吹き出しを表示
  $: showGuide = $notes.length === 0 && !isTourShown()

  function handleCreateNote() {
    dismissTour()
    onCreateNote('')
  }

  function handleDismiss() {
    dismissTour()
  }
</script>

<Footer>
  <svelte:fragment slot="left">
    <!-- アーカイブ内では新規作成不可 -->
    {#if currentWorld === 'home'}
      <span class="guide-container">
        <IconButton
          onClick={handleCreateNote}
          title={$_('footer.newNote')}
          ariaLabel={$_('footer.newNote')}
          {disabled}
        >
          <FolderPlusIcon />
        </IconButton>
        {#if showGuide}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="guide-tooltip" on:click={handleDismiss}>
            <span class="guide-text">{$_('guide.createNote')}</span>
            <span class="guide-close">×</span>
          </div>
        {/if}
      </span>
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="right">
    <PushButton
      {onPush}
      {isDirty}
      disabled={pushDisabled}
      disabledReason={pushDisabledReason}
      onDisabledClick={onDisabledPushClick}
    />
  </svelte:fragment>
</Footer>

<style>
  .guide-container {
    position: relative;
  }

  .guide-tooltip {
    position: absolute;
    bottom: 100%;
    left: 0;
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
  }

  .guide-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 12px;
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
