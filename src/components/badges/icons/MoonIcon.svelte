<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M15 3a7 7 0 1 0 6 11.8A6 6 0 1 1 15 3Z" fill={color} />
</BaseIcon>
