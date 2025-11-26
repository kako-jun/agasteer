<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" fill={color} />
</BaseIcon>
