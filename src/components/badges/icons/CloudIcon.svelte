<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M7 16a4 4 0 0 1 0-8 5 5 0 0 1 9.2-1.7A3.5 3.5 0 0 1 17.5 16H7Z" fill={color} />
</BaseIcon>
