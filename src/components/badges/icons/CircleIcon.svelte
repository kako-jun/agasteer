<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" fill={color} />
</BaseIcon>
