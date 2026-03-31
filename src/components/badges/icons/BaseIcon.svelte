<script lang="ts">
  interface Props {
    color?: string
    children?: import('svelte').Snippet<[string]>
  }

  let { color = 'currentColor', children }: Props = $props()
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  {@render children?.(color)}
</svg>
