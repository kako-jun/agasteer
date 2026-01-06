<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Settings, ThemeType } from '../../lib/types'
  import QRCodeSection from '../settings/QRCodeSection.svelte'
  import HelpLinks from '../settings/HelpLinks.svelte'
  import GitHubSettings from '../settings/GitHubSettings.svelte'
  import LanguageSelector from '../settings/LanguageSelector.svelte'
  import ThemeSelector from '../settings/ThemeSelector.svelte'
  import ToolNameInput from '../settings/ToolNameInput.svelte'
  import FontCustomizer from '../settings/FontCustomizer.svelte'
  import BackgroundCustomizer from '../settings/BackgroundCustomizer.svelte'
  import LinedModeToggle from '../settings/LinedModeToggle.svelte'
  import VimModeToggle from '../settings/VimModeToggle.svelte'
  import ExportSection from '../settings/ExportSection.svelte'
  import ImportSection from '../settings/ImportSection.svelte'
  import AboutSection from '../settings/AboutSection.svelte'
  import VersionDisplay from '../settings/VersionDisplay.svelte'
  import VisitorCounter from '../settings/VisitorCounter.svelte'

  export let settings: Settings
  export let onSettingsChange: (payload: Partial<Settings>) => void
  export let onThemeChange: (theme: ThemeType) => void
  export let isTesting: boolean = false
  export let onTestConnection: () => void
  export let onExportZip: () => void
  export let onImport: () => void
  export let exporting: boolean = false
  export let importing: boolean = false
</script>

<section class="settings-container">
  <div class="settings-content">
    <h2>{$_('settings.title')}</h2>

    <QRCodeSection />
    <HelpLinks />

    <div class="form-section">
      <GitHubSettings {settings} {onSettingsChange} {isTesting} {onTestConnection} />
      <hr />

      <div class="form-row">
        <div class="form-field">
          <h3>{$_('settings.extras.title')}</h3>

          <LanguageSelector {settings} {onSettingsChange} />
          <ThemeSelector {settings} {onThemeChange} {onSettingsChange} />
          <ToolNameInput {settings} {onSettingsChange} />
          <FontCustomizer {settings} {onSettingsChange} />
          <BackgroundCustomizer {settings} {onSettingsChange} />
          <LinedModeToggle {settings} {onSettingsChange} />
          <VimModeToggle {settings} {onSettingsChange} />
          <ExportSection {onExportZip} {exporting} />
          <ImportSection
            {onImport}
            {importing}
            supportedLabel={$_('settings.importExport.supported')}
          />
        </div>
      </div>
    </div>

    <AboutSection />
  </div>

  <VisitorCounter />
  <VersionDisplay />
</section>

<style>
  .settings-container {
    padding: 2rem;
    padding-bottom: 5rem;
    position: relative;
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  h2 {
    margin-bottom: 1.5rem;
    color: var(--text);
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--text);
  }

  .form-section {
    margin-top: 2rem;
    margin-bottom: 2rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2rem 0;
  }
</style>
