<script lang="ts">
  import { _ } from '../../lib/i18n'

  export let leafCount = 0
  export let leafCharCount = 0
  export let pushCount = 0
</script>

<div class="stats-overlay"></div>
<div class="statistics">
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
  /* 右下の三角形グラデーション背景 */
  .stats-overlay {
    position: fixed;
    bottom: 40px; /* フッターの高さ */
    right: 0;
    width: 400px;
    height: 400px;
    background: linear-gradient(
      135deg,
      transparent 45%,
      color-mix(in srgb, var(--bg) 60%, transparent) 65%,
      color-mix(in srgb, var(--bg) 80%, transparent) 100%
    );
    pointer-events: none;
    z-index: 1;
  }

  .statistics {
    position: fixed;
    bottom: calc(40px + 1rem); /* フッターの高さ + 余白 */
    right: 1rem;
    pointer-events: none;
    z-index: 2;
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
