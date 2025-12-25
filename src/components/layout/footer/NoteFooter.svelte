<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { leaves } from '../../../lib/stores/stores'
  import { isTourShown, dismissTour } from '../../../lib/tour'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import DeleteIcon from '../../icons/DeleteIcon.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'
  import FilePlusIcon from '../../icons/FilePlusIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'
  import ArchiveIcon from '../../icons/ArchiveIcon.svelte'
  import RestoreIcon from '../../icons/RestoreIcon.svelte'

  export let onDeleteNote: () => void
  export let onMove: () => void
  export let onCreateSubNote: (name: string) => void
  export let onCreateLeaf: (name: string) => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let canHaveSubNote: boolean
  export let saveDisabled: boolean = false
  export let saveDisabledReason: string = ''
  export let onDisabledSaveClick: ((reason: string) => void) | null = null
  /** 現在のワールド */
  export let currentWorld: WorldType = 'home'
  /** アーカイブ/リストアのコールバック */
  export let onArchive: (() => void) | null = null
  export let onRestore: (() => void) | null = null
  /** 現在のノートID（ガイド表示用） */
  export let noteId: string = ''

  // このノート配下のリーフが0個かつガイド未表示なら吹き出しを表示
  $: noteLeaves = $leaves.filter((l) => l.noteId === noteId)
  $: showGuide = noteLeaves.length === 0 && !isTourShown()

  function handleCreateLeaf() {
    dismissTour()
    onCreateLeaf('')
  }

  function handleDismiss() {
    dismissTour()
  }
</script>

<Footer>
  <svelte:fragment slot="left">
    <IconButton
      onClick={onDeleteNote}
      title={$_('footer.deleteNote')}
      ariaLabel={$_('footer.deleteNote')}
      {disabled}
    >
      <DeleteIcon />
    </IconButton>

    <IconButton onClick={onMove} title={$_('footer.move')} ariaLabel={$_('footer.move')} {disabled}>
      <MoveIcon />
    </IconButton>

    <!-- アーカイブ/リストアボタン -->
    {#if currentWorld === 'home' && onArchive}
      <IconButton
        onClick={onArchive}
        title={$_('footer.archive')}
        ariaLabel={$_('footer.archive')}
        {disabled}
      >
        <ArchiveIcon />
      </IconButton>
    {:else if currentWorld === 'archive' && onRestore}
      <IconButton
        onClick={onRestore}
        title={$_('footer.restore')}
        ariaLabel={$_('footer.restore')}
        {disabled}
      >
        <RestoreIcon />
      </IconButton>
    {/if}

    <!-- アーカイブ内では新規作成不可 -->
    {#if currentWorld === 'home'}
      {#if canHaveSubNote}
        <IconButton
          onClick={() => onCreateSubNote('')}
          title={$_('footer.newNote')}
          ariaLabel={$_('footer.newNote')}
          {disabled}
        >
          <FolderPlusIcon />
        </IconButton>
      {/if}

      <span class="guide-container">
        <IconButton
          onClick={handleCreateLeaf}
          title={$_('footer.newLeaf')}
          ariaLabel={$_('footer.newLeaf')}
          {disabled}
        >
          <FilePlusIcon />
        </IconButton>
        {#if showGuide}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="guide-tooltip" on:click={handleDismiss}>
            <span class="guide-text">{$_('guide.createLeaf')}</span>
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
