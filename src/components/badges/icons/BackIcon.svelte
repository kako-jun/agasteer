<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M16 5 6 12l10 7Z" fill={color} />
</BaseIcon>
