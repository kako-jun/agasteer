<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import type { WorldType } from '../../../lib/types'
  import { notes, isPushingBackground } from '../../../lib/stores/stores.svelte'
  import { isTourShown, dismissTour } from '../../../lib/tour'
  import Footer from '../Footer.svelte'
  import IconButton from '../../buttons/IconButton.svelte'
  import PushButton from '../../buttons/PushButton.svelte'
  import FolderPlusIcon from '../../icons/FolderPlusIcon.svelte'

  interface Props {
    onCreateNote: (name: string) => void
    onPush: () => void
    disabled: boolean
    isDirty: boolean
    pushDisabled?: boolean
    pushDisabledReason?: string
    onDisabledPushClick?: ((reason: string) => void) | null
    currentWorld?: WorldType
  }

  let {
    onCreateNote,
    onPush,
    disabled,
    isDirty,
    pushDisabled = false,
    pushDisabledReason = '',
    onDisabledPushClick = null,
    currentWorld = 'home',
  }: Props = $props()

  // ノートが0個かつガイド未表示かつボタンが有効（=初回Pull完了）なら吹き出しを表示
  let showGuide = $derived(notes.value.length === 0 && !isTourShown() && !pushDisabled)

  function handleCreateNote() {
    dismissTour()
    onCreateNote('')
  }

  function handleDismiss() {
    dismissTour()
  }
</script>

<Footer>
  {#snippet left()}
    <!-- アーカイブ内では新規作成不可 -->
    {#if currentWorld === 'home'}
      <span class="guide-container">
        <IconButton
          onClick={handleCreateNote}
          title={$_('footer.newNote')}
          ariaLabel={$_('footer.newNote')}
          {disabled}
        >
          <FolderPlusIcon />
        </IconButton>
        {#if showGuide}
          <div
            class="guide-tooltip"
            onclick={handleDismiss}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleDismiss()
              }
            }}
            role="button"
            tabindex="0"
          >
            <span class="guide-text">{$_('guide.createNote')}</span>
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
      isPushingBackground={isPushingBackground.value}
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
