<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import { uploadAndApplyBackground, removeAndDeleteCustomBackground } from '../../lib/background'
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

    // 動的プロパティキーを生成
    const hasCustomKey = pane === 'left' ? 'hasCustomBackgroundLeft' : 'hasCustomBackgroundRight'
    const opacityKey = pane === 'left' ? 'backgroundOpacityLeft' : 'backgroundOpacityRight'
    const errorMsgKey =
      pane === 'left'
        ? 'settings.extras.background.uploadFailedLeft'
        : 'settings.extras.background.uploadFailedRight'

    try {
      if (pane === 'left') {
        backgroundLeftUploading = true
      } else {
        backgroundRightUploading = true
      }

      await uploadAndApplyBackground(file, pane, BACKGROUND_OPACITY)

      // 設定を更新
      settings[hasCustomKey] = true
      settings[opacityKey] = BACKGROUND_OPACITY
      onSettingsChange({
        [hasCustomKey]: true,
        [opacityKey]: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error(`Failed to upload ${pane} background:`, error)
      showAlert($_(errorMsgKey))
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
    // 動的プロパティキーを生成
    const hasCustomKey = pane === 'left' ? 'hasCustomBackgroundLeft' : 'hasCustomBackgroundRight'
    const opacityKey = pane === 'left' ? 'backgroundOpacityLeft' : 'backgroundOpacityRight'
    const errorMsgKey =
      pane === 'left'
        ? 'settings.extras.background.resetFailedLeft'
        : 'settings.extras.background.resetFailedRight'

    try {
      await removeAndDeleteCustomBackground(pane)

      // 設定を更新
      settings[hasCustomKey] = false
      settings[opacityKey] = BACKGROUND_OPACITY
      onSettingsChange({
        [hasCustomKey]: false,
        [opacityKey]: BACKGROUND_OPACITY,
      })
    } catch (error) {
      console.error(`Failed to reset ${pane} background:`, error)
      showAlert($_(errorMsgKey))
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
    color: var(--text);
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
    color: var(--text-muted);
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
    background: var(--bg);
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
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .test-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
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
