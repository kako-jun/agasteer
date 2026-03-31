<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path d="M12 3 20 8v8l-8 5-8-5V8Z" fill={color} />
</BaseIcon>
