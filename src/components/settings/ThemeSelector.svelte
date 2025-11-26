<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings, ThemeType } from '../../lib/types'

  export let settings: Settings
  export let onThemeChange: (theme: ThemeType) => void
  export let onSettingsChange: (payload: Partial<Settings>) => void

  function handleThemeSelect(theme: ThemeType) {
    settings.theme = theme
    onThemeChange(theme)
    onSettingsChange({ theme })
  }
</script>

<div class="theme-selector">
  <span class="sub-label">{$_('settings.extras.theme.title')}</span>
  <div class="theme-buttons">
    <div class="theme-button-row">
      <button
        type="button"
        class:active={settings.theme === 'yomi'}
        on:click={() => handleThemeSelect('yomi')}
      >
        {$_('settings.extras.theme.yomi')}
      </button>
      <button
        type="button"
        class:active={settings.theme === 'campus'}
        on:click={() => handleThemeSelect('campus')}
      >
        {$_('settings.extras.theme.campus')}
      </button>
      <button
        type="button"
        class:active={settings.theme === 'greenboard'}
        on:click={() => handleThemeSelect('greenboard')}
      >
        {$_('settings.extras.theme.greenboard')}
      </button>
    </div>
    <div class="theme-button-row">
      <button
        type="button"
        class:active={settings.theme === 'whiteboard'}
        on:click={() => handleThemeSelect('whiteboard')}
      >
        {$_('settings.extras.theme.whiteboard')}
      </button>
      <button
        type="button"
        class:active={settings.theme === 'dotsD'}
        on:click={() => handleThemeSelect('dotsD')}
      >
        {$_('settings.extras.theme.dotsD')}
      </button>
      <button
        type="button"
        class:active={settings.theme === 'dotsF'}
        on:click={() => handleThemeSelect('dotsF')}
      >
        {$_('settings.extras.theme.dotsF')}
      </button>
    </div>
  </div>
</div>

<style>
  .theme-selector {
    margin-top: 1rem;
  }

  .sub-label {
    display: inline-block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .theme-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0 auto;
    max-width: fit-content;
  }

  .theme-button-row {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .theme-button-row:not(:first-child) {
    border-top: none;
  }

  .theme-button-row:first-child {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
  }

  .theme-button-row:last-child {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }

  .theme-button-row button {
    padding: 0.5rem 1rem;
    border: none;
    border-right: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--text);
    cursor: pointer;
    transition:
      background 0.2s,
      color 0.2s;
    min-width: 90px;
    border-radius: 0;
    flex: 1;
    white-space: nowrap;
  }

  .theme-button-row button:last-child {
    border-right: none;
  }

  .theme-button-row:first-child button:first-child {
    border-radius: 6px 0 0 0;
  }

  .theme-button-row:first-child button:last-child {
    border-radius: 0 6px 0 0;
  }

  .theme-button-row:last-child button:first-child {
    border-radius: 0 0 0 6px;
  }

  .theme-button-row:last-child button:last-child {
    border-radius: 0 0 6px 0;
  }

  .theme-button-row button.active {
    background: var(--accent);
    color: white;
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .theme-button-row button:hover:not(.active) {
    background: var(--bg);
  }
</style>
