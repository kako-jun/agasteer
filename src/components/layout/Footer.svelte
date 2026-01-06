<script lang="ts">
  import AutoSaveIndicator from './footer/AutoSaveIndicator.svelte'
</script>

<div class="footer-fixed">
  <slot name="left" />
  <div class="spacer"></div>
  <slot name="right" />
  <AutoSaveIndicator />
</div>

<style>
  .footer-fixed {
    position: relative;
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
