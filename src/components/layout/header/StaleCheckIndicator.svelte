<script lang="ts">
  import { staleCheckProgress } from '../../../lib/stores/stale-checker.svelte'

  // ヘッダー高さに合わせて高さを計算（フッターと同様にpx指定）
  let height = $derived(Math.round(staleCheckProgress.value * 40))
</script>

<div class="wrapper">
  {#if staleCheckProgress.value > 0}
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
