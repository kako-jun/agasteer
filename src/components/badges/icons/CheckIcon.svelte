<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M5 13l3-3 3 3 6-6 2 2-8 8-5-5Z" fill={color} />
</BaseIcon>
