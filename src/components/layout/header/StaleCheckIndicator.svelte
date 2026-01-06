<script lang="ts">
  import { staleCheckProgress } from '../../../lib/stores/stale-checker'

  // ヘッダー高さに合わせて高さを計算（フッターと同様にpx指定）
  $: height = Math.round($staleCheckProgress * 40)
</script>

<div class="wrapper">
  {#if $staleCheckProgress > 0}
    <div class="indicator" style="height: {height}px"></div>
  {/if}
</div>

<style>
  .wrapper {
    display: contents;
  }

  .indicator {
    position: absolute;
    left: 0;
    top: 0;
    width: 2px;
    background: var(--accent);
    opacity: 0.5;
    transition: height 50ms linear;
  }
</style>
