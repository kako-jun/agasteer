<script lang="ts">
  import { onMount } from 'svelte'

  let containerElement: HTMLDivElement

  onMount(() => {
    // Load the nostalgic script
    const script = document.createElement('script')
    script.src = 'https://nostalgic.llll-ll.com/components/visit.js'
    script.async = true
    document.head.appendChild(script)

    // Format counter with commas
    const formatCounter = () => {
      const counter = containerElement?.querySelector('nostalgic-counter')
      if (counter?.textContent) {
        const num = counter.textContent.replace(/,/g, '')
        if (/^\d+$/.test(num)) {
          counter.textContent = parseInt(num).toLocaleString()
        }
      }
    }

    // Wait for counter to load and format it
    const timer = setInterval(() => {
      const counter = containerElement?.querySelector('nostalgic-counter')
      if (counter?.textContent && counter.textContent !== '0') {
        formatCounter()
        clearInterval(timer)
      }
    }, 100)

    return () => {
      clearInterval(timer)
      // Cleanup script on component unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  })
</script>

<div class="visitor-counter" bind:this={containerElement}>
  <nostalgic-counter id="agasteer-c347357a" type="total" style="font-family: inherit"
  ></nostalgic-counter> views
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
    font-family: inherit;
  }

  .visitor-counter :global(nostalgic-counter) {
    font-family: inherit;
  }
</style>
