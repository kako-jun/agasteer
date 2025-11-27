<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import DownloadIcon from '../../icons/DownloadIcon.svelte'
  import FileEditIcon from '../../icons/FileEditIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'

  export let onMove: () => void
  export let onDownload: () => void
  export let onToggleEdit: () => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let saveDisabled: boolean = false
</script>

<Footer>
  <svelte:fragment slot="left">
    <IconButton onClick={onMove} title="移動" ariaLabel="移動" {disabled}>
      <MoveIcon />
    </IconButton>

    <IconButton
      onClick={onDownload}
      title={$_('footer.downloadImage')}
      ariaLabel={$_('footer.downloadImage')}
      {disabled}
    >
      <DownloadIcon />
    </IconButton>
  </svelte:fragment>
  <svelte:fragment slot="right">
    <IconButton
      onClick={onToggleEdit}
      title={$_('footer.edit')}
      ariaLabel={$_('footer.edit')}
      {disabled}
    >
      <FileEditIcon />
    </IconButton>

    <SaveButton {onSave} {isDirty} disabled={saveDisabled} />
  </svelte:fragment>
</Footer>
