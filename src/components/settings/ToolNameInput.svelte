<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  function handleToolNameInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings.toolName = value
    onSettingsChange({ toolName: value })
  }
</script>

<div class="tool-name-field">
  <label for="tool-name">{$_('settings.extras.toolName.label')}</label>
  <input
    id="tool-name"
    type="text"
    bind:value={settings.toolName}
    placeholder={$_('settings.extras.toolName.placeholder')}
    on:input={handleToolNameInput}
  />
</div>

<style>
  .tool-name-field {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 500;
  }

  input[type='text'] {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
  }

  input[type='text']:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
