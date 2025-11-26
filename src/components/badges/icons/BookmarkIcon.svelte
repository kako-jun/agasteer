<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M6 4h12v16l-6-3-6 3Z" fill={color} />
</BaseIcon>
