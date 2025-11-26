<script lang="ts">
  export let color = 'currentColor'
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  <slot {color} />
</svg>
