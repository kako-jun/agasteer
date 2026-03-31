<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <path
    d="M12 21C6 17.2 3.5 13.4 3.5 9.4 3.5 6.2 6 4.2 8.8 4.2 10.6 4.2 11.8 6.1 12 8.2 12.2 6.1 13.4 4.2 15.2 4.2 18 4.2 20.5 6.2 20.5 9.4 20.5 13.4 18 17.2 12 21Z"
    fill={color}
  />
</BaseIcon>
