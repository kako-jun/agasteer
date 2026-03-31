<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path d="M5 13l3-3 3 3 6-6 2 2-8 8-5-5Z" fill={color} />
</BaseIcon>
