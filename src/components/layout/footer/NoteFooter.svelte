<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { leaves } from '../../../lib/stores/stores.svelte'
  import { isTourShown, dismissTour } from '../../../lib/tour'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import PushButton from '../../buttons/PushButton.svelte'
  import DeleteIcon from '../../icons/DeleteIcon.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'
  import FilePlusIcon from '../../icons/FilePlusIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'
  import ArchiveIcon from '../../icons/ArchiveIcon.svelte'
  import RestoreIcon from '../../icons/RestoreIcon.svelte'

  interface Props {
    onDeleteNote: () => void
    onMove: () => void
    onCreateSubNote: (name: string) => void
    onCreateLeaf: (name: string) => void
    onPush: () => void
    disabled: boolean
    isDirty: boolean
    canHaveSubNote: boolean
    pushDisabled?: boolean
    pushDisabledReason?: string
    onDisabledPushClick?: ((reason: string) => void) | null
    currentWorld?: WorldType
    onArchive?: (() => void) | null
    onRestore?: (() => void) | null
    noteId?: string
  }

  let {
    onDeleteNote,
    onMove,
    onCreateSubNote,
    onCreateLeaf,
    onPush,
    disabled,
    isDirty,
    canHaveSubNote,
    pushDisabled = false,
    pushDisabledReason = '',
    onDisabledPushClick = null,
    currentWorld = 'home',
    onArchive = null,
    onRestore = null,
    noteId = '',
  }: Props = $props()

  // このノート配下のリーフが0個かつガイド未表示なら吹き出しを表示
  let noteLeaves = $derived(leaves.value.filter((l) => l.noteId === noteId))
  let showGuide = $derived(noteLeaves.length === 0 && !isTourShown())

  function handleCreateLeaf() {
    dismissTour()
    onCreateLeaf('')
  }

  function handleDismiss() {
    dismissTour()
  }
</script>

<Footer>
  {#snippet left()}
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
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="guide-tooltip" onclick={handleDismiss}>
            <span class="guide-text">{$_('guide.createLeaf')}</span>
            <span class="guide-close">×</span>
          </div>
        {/if}
      </span>
    {/if}
  {/snippet}
  {#snippet right()}
    <PushButton
      {onPush}
      {isDirty}
      disabled={pushDisabled}
      disabledReason={pushDisabledReason}
      onDisabledClick={onDisabledPushClick}
    />
  {/snippet}
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
