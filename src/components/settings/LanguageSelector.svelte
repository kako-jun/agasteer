<script lang="ts">
  import { _, locale } from '../../lib/i18n'
  import type { Settings, Locale } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  function handleLocaleChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value as Locale
    locale.set(value)
    settings.locale = value
    onSettingsChange({ locale: value })
  }
</script>

<div class="language-selector">
  <label for="language">{$_('settings.appearance.language')}</label>
  <div class="select-wrapper">
    <select id="language" bind:value={settings.locale} on:change={handleLocaleChange}>
      <option value="en">English</option>
      <option value="ja">日本語</option>
    </select>
  </div>
</div>

<style>
  .language-selector {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
  }

  select {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
    appearance: none;
    padding-right: 2rem;
    background-image: none;
    width: 100%;
  }

  .select-wrapper {
    position: relative;
  }

  .select-wrapper::after {
    content: '';
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--text);
  }

  select:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
