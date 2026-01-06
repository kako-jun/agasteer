<script lang="ts">
  import { autoPushProgress } from '../../../lib/stores/auto-save'

  // フッター高さに合わせて高さを計算
  $: height = Math.round($autoPushProgress * 40)
</script>

{#if $autoPushProgress > 0}
  <div class="indicator" style="height: {height}px"></div>
{/if}

<style>
  .indicator {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    opacity: 0.8;
    transition: height 50ms linear;
  }
</style>
