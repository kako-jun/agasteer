<script lang="ts">
  import { _ } from '../../lib/i18n'

  export let leafCount = 0
  export let leafCharCount = 0
  export let pushCount = 0
</script>

<div
  class="statistics"
  style="position: absolute; bottom: 1rem; right: 1rem; opacity: 0.5; pointer-events: none;"
>
  <div class="stat-item">
    <div class="stat-label">{$_('home.leafCount')}</div>
    <div class="stat-value">{leafCount.toLocaleString()}</div>
  </div>
  <div class="stat-item">
    <div class="stat-label">{$_('home.charCount')}</div>
    <div class="stat-value">{leafCharCount.toLocaleString()}</div>
  </div>
  <div class="stat-item">
    <div class="stat-label">{$_('home.pushCount')}</div>
    <div class="stat-value">{pushCount.toLocaleString()}</div>
  </div>
</div>

<style>
  .statistics {
    z-index: 1;
  }

  .stat-item {
    text-align: right;
  }

  .stat-item + .stat-item {
    margin-top: 0.35rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--accent);
  }
</style>
