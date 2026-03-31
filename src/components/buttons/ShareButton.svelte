<script lang="ts">
  import { _ } from '../../lib/i18n'
  import { onMount, onDestroy } from 'svelte'
  import IconButton from './IconButton.svelte'
  import ShareIcon from '../icons/ShareIcon.svelte'
  import LinkIcon from '../icons/LinkIcon.svelte'
  import CopyIcon from '../icons/CopyIcon.svelte'
  import UploadIcon from '../icons/UploadIcon.svelte'
  import QRCodeDisplay from '../QRCodeDisplay.svelte'

  interface Props {
    onCopyUrl: () => void
    onCopyMarkdown: () => void
    onShareImage?: (() => void) | null
    onShareSelectionImage?: (() => void) | null
    getHasSelection?: (() => boolean) | null
    getSelectedText?: (() => string) | null
    getMarkdownContent?: (() => string) | null
    isPreview?: boolean
  }

  let {
    onCopyUrl,
    onCopyMarkdown,
    onShareImage = null,
    onShareSelectionImage = null,
    getHasSelection = null,
    getSelectedText = null,
    getMarkdownContent = null,
    isPreview = false,
  }: Props = $props()

  let showMenu = false
  let menuElement: HTMLDivElement
  let supportsWebShare = false
  let currentHasSelection = false

  function toggleMenu() {
    // メニューを開く時に選択状態をチェック
    if (!showMenu && getHasSelection) {
      currentHasSelection = getHasSelection()
    }
    showMenu = !showMenu
  }

  function handleClickOutside(event: MouseEvent) {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      showMenu = false
    }
  }

  function handleCopyUrl() {
    onCopyUrl()
    showMenu = false
  }

  function handleCopyMarkdown() {
    onCopyMarkdown()
    showMenu = false
  }

  function handleShareImage() {
    if (onShareImage) {
      onShareImage()
      showMenu = false
    }
  }

  function handleShareSelectionImage() {
    if (onShareSelectionImage) {
      onShareSelectionImage()
      showMenu = false
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside)
    // Web Share APIのサポートチェック
    supportsWebShare = !!navigator.share && !!navigator.canShare
  })

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside)
  })
</script>

<div class="share-container" bind:this={menuElement}>
  <IconButton onClick={toggleMenu} title={$_('share.title')} ariaLabel={$_('share.title')}>
    <ShareIcon />
  </IconButton>

  {#if showMenu}
    <div class="share-menu">
      <button class="menu-item" onclick={handleCopyUrl}>
        <LinkIcon />
        <span>{$_('share.copyUrl')}</span>
      </button>

      <button class="menu-item" onclick={handleCopyMarkdown}>
        <CopyIcon />
        <span
          >{isPreview
            ? $_('share.copyImage')
            : currentHasSelection
              ? $_('share.copySelectionMarkdown')
              : $_('share.copyMarkdown')}</span
        >
      </button>

      {#if getMarkdownContent}
        <QRCodeDisplay
          hasSelection={currentHasSelection}
          getContent={() => {
            if (currentHasSelection && getSelectedText) {
              const selected = getSelectedText()
              if (selected) return selected
            }
            return getMarkdownContent()
          }}
        />
      {/if}

      {#if (isPreview && supportsWebShare && onShareImage) || (!isPreview && supportsWebShare && onShareSelectionImage)}
        <div class="menu-divider" />
      {/if}

      {#if isPreview && supportsWebShare && onShareImage}
        <button class="menu-item" onclick={handleShareImage}>
          <UploadIcon />
          <span>{$_('share.shareImage')}</span>
        </button>
      {/if}

      {#if !isPreview && supportsWebShare && onShareSelectionImage}
        <button class="menu-item" onclick={handleShareSelectionImage}>
          <UploadIcon />
          <span
            >{currentHasSelection ? $_('share.shareSelectionImage') : $_('share.shareImage')}</span
          >
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .share-container {
    position: relative;
    z-index: 1;
  }

  .share-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--bg);
    border: 1px solid var(--text-muted);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 0.5rem 0;
    min-width: 200px;
    z-index: 101;
    animation: fadeIn 0.15s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s;
    font-size: 0.9rem;
  }

  .menu-item:hover {
    background: var(--surface-1);
  }

  .menu-item :global(svg) {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .menu-item span {
    flex: 1;
    text-align: left;
  }

  .menu-divider {
    height: 1px;
    background: var(--text-muted);
    opacity: 0.3;
    margin: 0.5rem 0;
  }
</style>
