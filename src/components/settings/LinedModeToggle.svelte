<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  interface Props {
    settings: Settings
    onSettingsChange: (payload: Partial<Settings>) => void
  }

  let { settings, onSettingsChange }: Props = $props()

  function handleLinedModeChange(event: Event) {
    const value = (event.target as HTMLInputElement).checked
    settings.linedMode = value
    onSettingsChange({ linedMode: value })
  }
</script>

<div class="lined-mode-field">
  <label for="lined-mode" class="checkbox-label">
    <input
      id="lined-mode"
      type="checkbox"
      checked={settings.linedMode ?? false}
      onchange={handleLinedModeChange}
    />
    <span>{$_('settings.editor.linedMode')}</span>
  </label>
</div>

<style>
  .lined-mode-field {
    margin-top: 0;
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
