<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import PushButton from '../../buttons/PushButton.svelte'
  import DeleteIcon from '../../icons/DeleteIcon.svelte'
  import DownloadIcon from '../../icons/DownloadIcon.svelte'
  import EyeIcon from '../../icons/EyeIcon.svelte'
  import MoveIcon from '../../icons/MoveIcon.svelte'
  import ArchiveIcon from '../../icons/ArchiveIcon.svelte'
  import RestoreIcon from '../../icons/RestoreIcon.svelte'

  interface Props {
    onDelete: () => void
    onMove: () => void
    onDownload: () => void
    onTogglePreview: () => void
    onPush: () => void
    disabled: boolean
    isDirty: boolean
    pushDisabled?: boolean
    pushDisabledReason?: string
    onDisabledPushClick?: ((reason: string) => void) | null
    hideDeleteMove?: boolean
    getHasSelection?: (() => boolean) | null
    currentWorld?: WorldType
    onArchive?: (() => void) | null
    onRestore?: (() => void) | null
  }

  let {
    onDelete,
    onMove,
    onDownload,
    onTogglePreview,
    onPush,
    disabled,
    isDirty,
    pushDisabled = false,
    pushDisabledReason = '',
    onDisabledPushClick = null,
    hideDeleteMove = false,
    getHasSelection = null,
    currentWorld = 'home',
    onArchive = null,
    onRestore = null,
  }: Props = $props()

  let downloadTitle = $state($_('footer.download'))

  // マウスエンター時に選択状態をチェックしてtitleを更新
  function updateDownloadTitle() {
    downloadTitle =
      getHasSelection && getHasSelection() ? $_('footer.downloadSelection') : $_('footer.download')
  }

  // ダウンロードボタンクリック時
  function handleDownload() {
    onDownload()
  }
</script>

<Footer>
  {#snippet left()}
    {#if !hideDeleteMove}
      <IconButton
        onClick={onDelete}
        title={$_('footer.deleteLeaf')}
        ariaLabel={$_('footer.deleteLeaf')}
        {disabled}
      >
        <DeleteIcon />
      </IconButton>

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
      onClick={handleDownload}
      onMouseEnter={updateDownloadTitle}
      title={downloadTitle}
      ariaLabel={downloadTitle}
      {disabled}
    >
      <DownloadIcon />
    </IconButton>
  {/snippet}
  {#snippet right()}
    <IconButton
      onClick={onTogglePreview}
      title={$_('footer.preview')}
      ariaLabel={$_('footer.preview')}
    >
      <EyeIcon />
    </IconButton>

    <PushButton
      {onPush}
      {isDirty}
      disabled={pushDisabled}
      disabledReason={pushDisabledReason}
      onDisabledClick={onDisabledPushClick}
    />
  {/snippet}
</Footer>
