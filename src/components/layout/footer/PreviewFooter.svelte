<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { isPushingBackground } from '../../../lib/stores/stores.svelte'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import PushButton from '../../buttons/PushButton.svelte'
  import DownloadIcon from '../../icons/DownloadIcon.svelte'
  import FileEditIcon from '../../icons/FileEditIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'
  import ArchiveIcon from '../../icons/ArchiveIcon.svelte'
  import RestoreIcon from '../../icons/RestoreIcon.svelte'

  interface Props {
    onMove: () => void
    onDownload: () => void
    onToggleEdit: () => void
    onPush: () => void
    disabled: boolean
    isDirty: boolean
    pushDisabled?: boolean
    pushDisabledReason?: string
    onDisabledPushClick?: ((reason: string) => void) | null
    hideEditButton?: boolean
    hideMoveButton?: boolean
    currentWorld?: WorldType
    onArchive?: (() => void) | null
    onRestore?: (() => void) | null
  }

  let {
    onMove,
    onDownload,
    onToggleEdit,
    onPush,
    disabled,
    isDirty,
    pushDisabled = false,
    pushDisabledReason = '',
    onDisabledPushClick = null,
    hideEditButton = false,
    hideMoveButton = false,
    currentWorld = 'home',
    onArchive = null,
    onRestore = null,
  }: Props = $props()
</script>

<Footer>
  {#snippet left()}
    {#if !hideMoveButton}
      <IconButton
        onClick={onMove}
        title={$_('footer.move')}
        ariaLabel={$_('footer.move')}
        {disabled}
      >
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
    {/if}

    <IconButton
      onClick={onDownload}
      title={$_('footer.downloadImage')}
      ariaLabel={$_('footer.downloadImage')}
      {disabled}
    >
      <DownloadIcon />
    </IconButton>
  {/snippet}
  {#snippet right()}
    {#if !hideEditButton}
      <IconButton onClick={onToggleEdit} title={$_('footer.edit')} ariaLabel={$_('footer.edit')}>
        <FileEditIcon />
      </IconButton>
    {/if}

    <PushButton
      {onPush}
      {isDirty}
      disabled={pushDisabled}
      disabledReason={pushDisabledReason}
      onDisabledClick={onDisabledPushClick}
      isPushingBackground={isPushingBackground.value}
    />
  {/snippet}
</Footer>
