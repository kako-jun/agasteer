<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import SaveButton from '../../buttons/SaveButton.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'

  export let onCreateNote: () => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
  export let saveDisabled: boolean = false
</script>

<Footer>
  <svelte:fragment slot="left">
    <IconButton
      onClick={onCreateNote}
      title={$_('footer.newNote')}
      ariaLabel={$_('footer.newNote')}
      {disabled}
    >
      <FolderPlusIcon />
    </IconButton>
  </svelte:fragment>
  <svelte:fragment slot="right">
    <SaveButton {onSave} {isDirty} disabled={saveDisabled} />
  </svelte:fragment>
</Footer>
