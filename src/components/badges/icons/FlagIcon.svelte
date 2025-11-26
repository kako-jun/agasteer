<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M6 4h9l-1.2 3L16 10H6v7H4V4h2Z" fill={color} />
</BaseIcon>
