<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M13 2 6 13h4l-1 9 8-12h-4Z" fill={color} />
</BaseIcon>
