<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M8 5l10 7-10 7Z" fill={color} />
</BaseIcon>
