<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void

  function handleVimModeChange(event: Event) {
    const value = (event.target as HTMLInputElement).checked
    settings.vimMode = value
    onSettingsChange({ vimMode: value })
  }
</script>

<div class="vim-mode-field">
  <label for="vim-mode" class="checkbox-label">
    <input
      id="vim-mode"
      type="checkbox"
      checked={settings.vimMode ?? false}
      on:change={handleVimModeChange}
    />
    <span>{$_('settings.editor.vimMode')}</span>
  </label>
</div>

<style>
  .vim-mode-field {
    margin-top: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
</style>
