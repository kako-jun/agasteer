<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path
    d="M7 17a4.5 4.5 0 0 1 0-9 5 5 0 0 1 9.2-1.7A3.5 3.5 0 0 1 18 17H7Z"
    transform="translate(0 1)"
    fill={color}
  />
</BaseIcon>
