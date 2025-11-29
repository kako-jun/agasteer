<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import DeleteIcon from '../../icons/DeleteIcon.svelte'
  import DownloadIcon from '../../icons/DownloadIcon.svelte'
  import EyeIcon from '../../icons/EyeIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'

  export let onDelete: () => void
  export let onMove: () => void
  export let onDownload: () => void
  export let onTogglePreview: () => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let saveDisabled: boolean = false
  export let saveDisabledReason: string = ''
  export let onDisabledSaveClick: ((reason: string) => void) | null = null
</script>

<Footer>
  <svelte:fragment slot="left">
    <IconButton
      onClick={onDelete}
      title={$_('footer.deleteLeaf')}
      ariaLabel={$_('footer.deleteLeaf')}
      {disabled}
    >
      <DeleteIcon />
    </IconButton>

    <IconButton onClick={onMove} title="移動" ariaLabel="移動" {disabled}>
      <MoveIcon />
    </IconButton>

    <IconButton
      onClick={onDownload}
      title={$_('footer.download')}
      ariaLabel={$_('footer.download')}
      {disabled}
    >
      <DownloadIcon />
    </IconButton>
  </svelte:fragment>
  <svelte:fragment slot="right">
    <IconButton
      onClick={onTogglePreview}
      title={$_('footer.preview')}
      ariaLabel={$_('footer.preview')}
      {disabled}
    >
      <EyeIcon />
    </IconButton>

    <SaveButton
      {onSave}
      {isDirty}
      disabled={saveDisabled}
      disabledReason={saveDisabledReason}
      onDisabledClick={onDisabledSaveClick}
    />
  </svelte:fragment>
</Footer>
