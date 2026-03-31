<script lang="ts">
  import { _ } from '../../lib/i18n'
  import { defaultSettings } from '../../lib/data'
  import type { Settings } from '../../lib/types'

  interface Props {
    settings: Settings
    onSettingsChange: (payload: Partial<Settings>) => void
  }

  let { settings, onSettingsChange }: Props = $props()

  function handleToolNameInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    settings.toolName = value
    onSettingsChange({ toolName: value })
  }

  function handleResetToolName() {
    settings.toolName = defaultSettings.toolName
    onSettingsChange({ toolName: defaultSettings.toolName })
  }

  let isDefaultToolName = $derived(settings.toolName === defaultSettings.toolName)
</script>

<div class="tool-name-field">
  <label for="tool-name">{$_('settings.appearance.toolName.label')}</label>
  <div class="tool-name-controls">
    <input
      id="tool-name"
      type="text"
      bind:value={settings.toolName}
      placeholder={$_('settings.appearance.toolName.placeholder')}
      oninput={handleToolNameInput}
    />
    {#if !isDefaultToolName}
      <button type="button" class="reset-button" onclick={handleResetToolName}>
        {$_('settings.appearance.toolName.reset')}
      </button>
    {/if}
  </div>
</div>

<style>
  .tool-name-field {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
  }

  .tool-name-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
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
    flex: 1;
  }

  input[type='text']:focus {
    outline: none;
    border-color: var(--accent);
  }

  .reset-button {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-1);
    color: var(--text);
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .reset-button:hover {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>
