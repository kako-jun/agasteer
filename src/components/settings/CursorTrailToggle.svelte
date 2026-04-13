<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  interface Props {
    settings: Settings
    onSettingsChange: (payload: Partial<Settings>) => void
  }

  let { settings, onSettingsChange }: Props = $props()

  function handleCursorTrailChange(event: Event) {
    const value = (event.target as HTMLInputElement).checked
    settings.cursorTrailEnabled = value
    onSettingsChange({ cursorTrailEnabled: value })
  }
</script>

<div class="cursor-trail-field">
  <label for="cursor-trail" class="checkbox-label">
    <input
      id="cursor-trail"
      type="checkbox"
      checked={settings.cursorTrailEnabled ?? false}
      onchange={handleCursorTrailChange}
    />
    <span>{$_('settings.editor.cursorTrail')}</span>
  </label>
</div>

<style>
  .cursor-trail-field {
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
