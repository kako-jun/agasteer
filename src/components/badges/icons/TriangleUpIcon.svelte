<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path d="M12 6 18 18H6Z" fill={color} />
</BaseIcon>
