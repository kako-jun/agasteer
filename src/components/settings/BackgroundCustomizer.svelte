<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import {
    uploadAndApplyBackground,
    removeAndDeleteCustomBackground,
    loadAndApplyCustomBackgrounds,
  } from '../../lib/ui'
  import { showAlert } from '../../lib/ui'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  let backgroundLeftFileInput: HTMLInputElement
  let backgroundRightFileInput: HTMLInputElement
  let backgroundLeftUploading = false
  let backgroundRightUploading = false

  const DEFAULT_OPACITY = 0.1
  const MIN_OPACITY = 0.1
  const MAX_OPACITY = 0.5
  const OPACITY_STEP = 0.05

  // 透明度変更ハンドラー
  async function handleOpacityChange(pane: 'left' | 'right', value: number) {
    const opacityKey = pane === 'left' ? 'backgroundOpacityLeft' : 'backgroundOpacityRight'
    settings[opacityKey] = value
    onSettingsChange({ [opacityKey]: value })

    // 背景を再適用
    await loadAndApplyCustomBackgrounds(
      settings.backgroundOpacityLeft ?? DEFAULT_OPACITY,
      settings.backgroundOpacityRight ?? DEFAULT_OPACITY
    )
  }

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
      showAlert($_('settings.appearance.background.invalidFormat'))
      return
    }

    // 動的プロパティキーを生成
    const hasCustomKey = pane === 'left' ? 'hasCustomBackgroundLeft' : 'hasCustomBackgroundRight'
    const opacityKey = pane === 'left' ? 'backgroundOpacityLeft' : 'backgroundOpacityRight'
    const errorMsgKey =
      pane === 'left'
        ? 'settings.appearance.background.uploadFailedLeft'
        : 'settings.appearance.background.uploadFailedRight'

    try {
      if (pane === 'left') {
        backgroundLeftUploading = true
      } else {
        backgroundRightUploading = true
      }

      await uploadAndApplyBackground(file, pane, DEFAULT_OPACITY)

      // 設定を更新
      settings[hasCustomKey] = true
      settings[opacityKey] = DEFAULT_OPACITY
      onSettingsChange({
        [hasCustomKey]: true,
        [opacityKey]: DEFAULT_OPACITY,
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
        ? 'settings.appearance.background.resetFailedLeft'
        : 'settings.appearance.background.resetFailedRight'

    try {
      await removeAndDeleteCustomBackground(pane)

      // 設定を更新
      settings[hasCustomKey] = false
      settings[opacityKey] = DEFAULT_OPACITY
      onSettingsChange({
        [hasCustomKey]: false,
        [opacityKey]: DEFAULT_OPACITY,
      })
    } catch (error) {
      console.error(`Failed to reset ${pane} background:`, error)
      showAlert($_(errorMsgKey))
    }
  }
</script>

<div class="background-customizer">
  <span class="sub-label">{$_('settings.appearance.background.title')}</span>
  <div class="background-dual-pane">
    <!-- Left Pane -->
    <div class="background-pane">
      <span class="pane-label">{$_('settings.appearance.background.leftPane')}</span>
      {#if settings.hasCustomBackgroundLeft}
        <div class="background-preview background-preview-left">
          <span class="preview-label">{$_('settings.appearance.background.preview')}</span>
        </div>
        <label class="opacity-control">
          <span class="opacity-label">
            {$_('settings.appearance.background.opacity')}
            <span class="opacity-value"
              >{Math.round((settings.backgroundOpacityLeft ?? DEFAULT_OPACITY) * 100)}%</span
            >
          </span>
          <input
            type="range"
            class="opacity-slider"
            min={MIN_OPACITY}
            max={MAX_OPACITY}
            step={OPACITY_STEP}
            value={settings.backgroundOpacityLeft ?? DEFAULT_OPACITY}
            on:input={(e) => handleOpacityChange('left', parseFloat(e.currentTarget.value))}
          />
        </label>
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
            ? $_('settings.appearance.background.uploading')
            : $_('settings.appearance.background.select')}
        </button>
        {#if settings.hasCustomBackgroundLeft}
          <button type="button" class="test-button" on:click={() => handleResetBackground('left')}>
            {$_('settings.appearance.background.reset')}
          </button>
        {/if}
      </div>
    </div>

    <!-- Right Pane -->
    <div class="background-pane">
      <span class="pane-label">{$_('settings.appearance.background.rightPane')}</span>
      {#if settings.hasCustomBackgroundRight}
        <div class="background-preview background-preview-right">
          <span class="preview-label">{$_('settings.appearance.background.preview')}</span>
        </div>
        <label class="opacity-control">
          <span class="opacity-label">
            {$_('settings.appearance.background.opacity')}
            <span class="opacity-value"
              >{Math.round((settings.backgroundOpacityRight ?? DEFAULT_OPACITY) * 100)}%</span
            >
          </span>
          <input
            type="range"
            class="opacity-slider"
            min={MIN_OPACITY}
            max={MAX_OPACITY}
            step={OPACITY_STEP}
            value={settings.backgroundOpacityRight ?? DEFAULT_OPACITY}
            on:input={(e) => handleOpacityChange('right', parseFloat(e.currentTarget.value))}
          />
        </label>
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
            ? $_('settings.appearance.background.uploading')
            : $_('settings.appearance.background.select')}
        </button>
        {#if settings.hasCustomBackgroundRight}
          <button type="button" class="test-button" on:click={() => handleResetBackground('right')}>
            {$_('settings.appearance.background.reset')}
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

  .opacity-control {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .opacity-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .opacity-value {
    font-weight: 500;
    color: var(--text);
  }

  .opacity-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-1);
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  .opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    transition: transform 0.15s;
  }

  .opacity-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .opacity-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: none;
    transition: transform 0.15s;
  }

  .opacity-slider::-moz-range-thumb:hover {
    transform: scale(1.1);
  }
</style>
