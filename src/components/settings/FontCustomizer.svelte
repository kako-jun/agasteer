<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import { uploadAndApplyFont, removeAndDeleteCustomFont } from '../../lib/ui'
  import { showAlert } from '../../lib/ui'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  let fileInput: HTMLInputElement
  let fontUploading = false

  function handleFontButtonClick() {
    fileInput?.click()
  }

  async function handleFontFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) return

    // フォントファイルの拡張子チェック
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const fileName = file.name.toLowerCase()
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      showAlert($_('settings.appearance.font.invalidFormat'))
      return
    }

    try {
      fontUploading = true
      await uploadAndApplyFont(file)
      settings.hasCustomFont = true
      onSettingsChange({ hasCustomFont: true })
    } catch (error) {
      console.error('Failed to upload font:', error)
      showAlert($_('settings.appearance.font.uploadFailed'))
    } finally {
      fontUploading = false
      input.value = ''
    }
  }

  async function handleResetFont() {
    try {
      await removeAndDeleteCustomFont()
      settings.hasCustomFont = false
      onSettingsChange({ hasCustomFont: false })
    } catch (error) {
      console.error('Failed to reset font:', error)
      showAlert($_('settings.appearance.font.resetFailed'))
    }
  }
</script>

<div class="font-customizer">
  <span class="sub-label">{$_('settings.appearance.font.title')}</span>
  <div class="font-controls">
    <input
      type="file"
      accept=".ttf,.otf,.woff,.woff2"
      bind:this={fileInput}
      on:change={handleFontFileChange}
      style="display: none;"
    />
    <button
      type="button"
      class="test-button"
      on:click={handleFontButtonClick}
      disabled={fontUploading}
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
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </svg>
      {fontUploading
        ? $_('settings.appearance.font.uploading')
        : $_('settings.appearance.font.select')}
    </button>
    {#if settings.hasCustomFont}
      <button type="button" class="test-button" on:click={handleResetFont}>
        {$_('settings.appearance.font.reset')}
      </button>
    {/if}
  </div>
</div>

<style>
  .font-customizer {
    margin-top: 1rem;
  }

  .sub-label {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .font-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
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
