<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'

  interface Props {
    settings: Settings
    onSettingsChange: (payload: Partial<Settings>) => void
  }

  let { settings, onSettingsChange }: Props = $props()

  function handleMediaOptimizeChange(event: Event) {
    const value = (event.target as HTMLInputElement).checked
    settings.mediaOptimizeImages = value
    onSettingsChange({ mediaOptimizeImages: value })
  }
</script>

<div class="media-optimize-field">
  <label for="media-optimize" class="checkbox-label">
    <input
      id="media-optimize"
      type="checkbox"
      checked={settings.mediaOptimizeImages ?? true}
      onchange={handleMediaOptimizeChange}
    />
    <span>{$_('settings.editor.mediaOptimize')}</span>
  </label>
</div>

<style>
  .media-optimize-field {
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
