<script lang="ts">
  import { onMount } from 'svelte'

  let containerElement: HTMLDivElement

  onMount(() => {
    // Load the nostalgic script
    const script = document.createElement('script')
    script.src = 'https://nostalgic.llll-ll.com/components/visit.js'
    script.async = true
    document.head.appendChild(script)

    return () => {
      // Cleanup script on component unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  })
</script>

<div class="visitor-counter" bind:this={containerElement}>
  <nostalgic-counter id="agasteer-c347357a" type="total" format="text"></nostalgic-counter>
</div>

<style>
  .visitor-counter {
    position: absolute;
    bottom: 0.5rem;
    left: 1rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }
</style>
