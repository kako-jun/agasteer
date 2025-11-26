<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M12 7 17 12 12 17 7 12Z" fill={color} />
</BaseIcon>
