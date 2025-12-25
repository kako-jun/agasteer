<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { notes } from '../../../lib/stores/stores'
  import { isTourShown, dismissTour } from '../../../lib/tour'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'

  export let onCreateNote: (name: string) => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let saveDisabled: boolean = false
  export let saveDisabledReason: string = ''
  export let onDisabledSaveClick: ((reason: string) => void) | null = null
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
    <SaveButton
      {onSave}
      {isDirty}
      disabled={saveDisabled}
      disabledReason={saveDisabledReason}
      onDisabledClick={onDisabledSaveClick}
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
    margin-bottom: 8px;
    padding: 6px 10px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 4px;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
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
