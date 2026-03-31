<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'

  interface Props {
    color?: string
  }

  let { color = 'currentColor' }: Props = $props()
</script>

<BaseIcon {color}>
  <circle cx="12" cy="6.5" r="3.1" fill={color} />
  <circle cx="8.7" cy="11" r="3.1" fill={color} />
  <circle cx="15.3" cy="11" r="3.1" fill={color} />
  <rect x="11" y="11" width="2" height="7" rx="1" fill={color} />
  <path d="M9.4 18.5h5.2L12 22Z" fill={color} />
</BaseIcon>
