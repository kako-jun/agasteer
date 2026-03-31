<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path d="M13 2 6 13h4l-1 9 8-12h-4Z" fill={color} />
</BaseIcon>
