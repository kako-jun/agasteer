<script lang="ts">
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import DeleteIcon from '../../icons/DeleteIcon.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'
  import FilePlusIcon from '../../icons/FilePlusIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'

  export let onDeleteNote: () => void
  export let onMove: () => void
  export let onCreateSubNote: () => void
  export let onCreateLeaf: () => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let canHaveSubNote: boolean
  export let saveDisabled: boolean = false
</script>

<Footer>
  <svelte:fragment slot="left">
    <IconButton onClick={onDeleteNote} title="ノートを削除" ariaLabel="ノートを削除" {disabled}>
      <DeleteIcon />
    </IconButton>

    <IconButton onClick={onMove} title="移動" ariaLabel="移動" {disabled}>
      <MoveIcon />
    </IconButton>

    {#if canHaveSubNote}
      <IconButton
        onClick={onCreateSubNote}
        title="新規サブノート"
        ariaLabel="新規サブノート"
        {disabled}
      >
        <FolderPlusIcon />
      </IconButton>
    {/if}

    <IconButton onClick={onCreateLeaf} title="新規リーフ" ariaLabel="新規リーフ" {disabled}>
      <FilePlusIcon />
    </IconButton>
  </svelte:fragment>
  <svelte:fragment slot="right">
    <SaveButton {onSave} {isDirty} disabled={saveDisabled} />
  </svelte:fragment>
</Footer>
