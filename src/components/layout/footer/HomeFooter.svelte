<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
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
</script>

<Footer>
  <svelte:fragment slot="left">
    <!-- アーカイブ内では新規作成不可 -->
    {#if currentWorld === 'home'}
      <IconButton
        onClick={() => onCreateNote('')}
        title={$_('footer.newNote')}
        ariaLabel={$_('footer.newNote')}
        {disabled}
      >
        <FolderPlusIcon />
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
