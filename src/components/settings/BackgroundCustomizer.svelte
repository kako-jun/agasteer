<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import {
    uploadAndApplyBackgroundLeft,
    uploadAndApplyBackgroundRight,
    removeAndDeleteCustomBackgroundLeft,
    removeAndDeleteCustomBackgroundRight,
  } from '../../lib/background'
  import { showAlert } from '../../lib/ui'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  let backgroundLeftFileInput: HTMLInputElement
  let backgroundRightFileInput: HTMLInputElement
  let backgroundLeftUploading = false
  let backgroundRightUploading = false

  const BACKGROUND_OPACITY = 0.1

  type Pane = 'left' | 'right'

  function handleBackgroundButtonClick(pane: Pane) {
    if (pane === 'left') {
      backgroundLeftFileInput?.click()
    } else {
      backgroundRightFileInput?.click()
    }
  }

  async function handleBackgroundFileChange(event: Event, pane: Pane) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) return

    // 画像ファイルの拡張子チェック
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      showAlert($_('settings.extras.background.invalidFormat'))
      return
    }

    try {
      if (pane === 'left') {
        backgroundLeftUploading = true
        await uploadAndApplyBackgroundLeft(file, BACKGROUND_OPACITY)
        settings.hasCustomBackgroundLeft = true
        settings.backgroundOpacityLeft = BACKGROUND_OPACITY
        onSettingsChange({
          hasCustomBackgroundLeft: true,
          backgroundOpacityLeft: BACKGROUND_OPACITY,
        })
      } else {
        backgroundRightUploading = true
        await uploadAndApplyBackgroundRight(file, BACKGROUND_OPACITY)
        settings.hasCustomBackgroundRight = true
        settings.backgroundOpacityRight = BACKGROUND_OPACITY
        onSettingsChange({
          hasCustomBackgroundRight: true,
          backgroundOpacityRight: BACKGROUND_OPACITY,
        })
      }
    } catch (error) {
      console.error(`Failed to upload ${pane} background:`, error)
      const errorMsg =
        pane === 'left'
          ? $_('settings.extras.background.uploadFailedLeft')
          : $_('settings.extras.background.uploadFailedRight')
      showAlert(errorMsg)
    } finally {
      if (pane === 'left') {
        backgroundLeftUploading = false
      } else {
        backgroundRightUploading = false
      }
      input.value = ''
    }
  }

  async function handleResetBackground(pane: Pane) {
    try {
      if (pane === 'left') {
        await removeAndDeleteCustomBackgroundLeft()
        settings.hasCustomBackgroundLeft = false
        settings.backgroundOpacityLeft = BACKGROUND_OPACITY
        onSettingsChange({
          hasCustomBackgroundLeft: false,
          backgroundOpacityLeft: BACKGROUND_OPACITY,
        })
      } else {
        await removeAndDeleteCustomBackgroundRight()
        settings.hasCustomBackgroundRight = false
        settings.backgroundOpacityRight = BACKGROUND_OPACITY
        onSettingsChange({
          hasCustomBackgroundRight: false,
          backgroundOpacityRight: BACKGROUND_OPACITY,
        })
      }
    } catch (error) {
      console.error(`Failed to reset ${pane} background:`, error)
      const errorMsg =
        pane === 'left'
          ? $_('settings.extras.background.resetFailedLeft')
          : $_('settings.extras.background.resetFailedRight')
      showAlert(errorMsg)
    }
  }
</script>

<div class="background-customizer">
  <span class="sub-label">{$_('settings.extras.background.title')}</span>
  <div class="background-dual-pane">
    <!-- Left Pane -->
    <div class="background-pane">
      <span class="pane-label">{$_('settings.extras.background.leftPane')}</span>
      {#if settings.hasCustomBackgroundLeft}
        <div class="background-preview background-preview-left">
          <span class="preview-label">{$_('settings.extras.background.preview')}</span>
        </div>
      {/if}
      <div class="background-controls">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          bind:this={backgroundLeftFileInput}
          on:change={(e) => handleBackgroundFileChange(e, 'left')}
          style="display: none;"
        />
        <button
          type="button"
          class="test-button"
          on:click={() => handleBackgroundButtonClick('left')}
          disabled={backgroundLeftUploading}
        >
          <svg
            class="test-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {backgroundLeftUploading
            ? $_('settings.extras.background.uploading')
            : $_('settings.extras.background.select')}
        </button>
        {#if settings.hasCustomBackgroundLeft}
          <button type="button" class="test-button" on:click={() => handleResetBackground('left')}>
            {$_('settings.extras.background.reset')}
          </button>
        {/if}
      </div>
    </div>

    <!-- Right Pane -->
    <div class="background-pane">
      <span class="pane-label">{$_('settings.extras.background.rightPane')}</span>
      {#if settings.hasCustomBackgroundRight}
        <div class="background-preview background-preview-right">
          <span class="preview-label">{$_('settings.extras.background.preview')}</span>
        </div>
      {/if}
      <div class="background-controls">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          bind:this={backgroundRightFileInput}
          on:change={(e) => handleBackgroundFileChange(e, 'right')}
          style="display: none;"
        />
        <button
          type="button"
          class="test-button"
          on:click={() => handleBackgroundButtonClick('right')}
          disabled={backgroundRightUploading}
        >
          <svg
            class="test-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {backgroundRightUploading
            ? $_('settings.extras.background.uploading')
            : $_('settings.extras.background.select')}
        </button>
        {#if settings.hasCustomBackgroundRight}
          <button type="button" class="test-button" on:click={() => handleResetBackground('right')}>
            {$_('settings.extras.background.reset')}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .background-customizer {
    margin-top: 1rem;
  }

  .sub-label {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .background-dual-pane {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .background-pane {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .pane-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .background-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .background-preview {
    position: relative;
    width: 100%;
    height: 120px;
    background: var(--bg-primary);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-label {
    position: relative;
    z-index: 1;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .test-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button:hover:not(:disabled) {
    background: var(--accent-color);
    color: white;
    border-color: var(--accent-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .test-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
</style>
