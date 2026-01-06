<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import SettingsView from '../views/SettingsView.svelte'

  export let show: boolean
  export let settings: Settings
  export let isTesting: boolean
  export let exporting: boolean
  export let importing: boolean
  export let onThemeChange: (theme: string) => void
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onTestConnection: () => void
  export let onExportZip: () => void
  export let onImport: () => void
  export let onClose: () => void

  let pointerFromContent = false

  function handleOverlayClick() {
    if (pointerFromContent) {
      pointerFromContent = false
      return
    }
    onClose()
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClose()
    }
  }

  function handleContentPointerDown() {
    pointerFromContent = true
  }

  function handleContentPointerUp() {
    pointerFromContent = false
  }

  function handleContentClick(e: MouseEvent) {
    e.stopPropagation()
  }
</script>

{#if show}
  <div
    class="settings-modal-overlay"
    role="button"
    tabindex="0"
    on:click={handleOverlayClick}
    on:keydown={handleOverlayKeydown}
    aria-label={$_('common.closeSettings')}
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="settings-modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      tabindex="-1"
      on:pointerdown={handleContentPointerDown}
      on:pointerup={handleContentPointerUp}
      on:click={handleContentClick}
    >
      <button class="settings-close-button" on:click={onClose} aria-label={$_('common.close')}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <SettingsView
        {settings}
        {onThemeChange}
        {onSettingsChange}
        {isTesting}
        {onTestConnection}
        {onExportZip}
        {onImport}
        {exporting}
        {importing}
      />
    </div>
  </div>
{/if}

<style>
  .settings-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .settings-modal-content {
    position: relative;
    background: var(--bg);
    border-radius: 8px;
    max-width: 600px;
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .settings-close-button {
    position: absolute;
    top: 12px;
    right: 12px;
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    z-index: 10;
  }

  .settings-close-button:hover {
    background: var(--card-hover);
  }
</style>
