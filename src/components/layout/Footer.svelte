<script lang="ts">
  import AutoSaveIndicator from './footer/AutoSaveIndicator.svelte'

  interface Props {
    left?: import('svelte').Snippet
    center?: import('svelte').Snippet
    right?: import('svelte').Snippet
  }

  let { left, center, right }: Props = $props()
</script>

<div class="footer-fixed">
  {@render left?.()}
  <div class="spacer"></div>
  {@render center?.()}
  <div class="spacer"></div>
  {@render right?.()}
  <AutoSaveIndicator />
</div>

<style>
  .footer-fixed {
    position: relative;
    z-index: 300;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-top: 1px solid rgba(0, 0, 0, 0.15);
    padding: 0 1rem;
    height: 40px;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
  }

  :global([data-theme='greenboard']) .footer-fixed,
  :global([data-theme='dotsD']) .footer-fixed,
  :global([data-theme='dotsF']) .footer-fixed {
    background: rgba(255, 255, 255, 0.15);
    border-top: 1px solid rgba(255, 255, 255, 0.15);
  }

  .spacer {
    flex: 1;
  }
</style>
