<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
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

      <IconButton
        onClick={() => onCreateLeaf('')}
        title={$_('footer.newLeaf')}
        ariaLabel={$_('footer.newLeaf')}
        {disabled}
      >
        <FilePlusIcon />
      </IconButton>
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
