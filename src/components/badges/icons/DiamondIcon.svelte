<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M12 3 21 12 12 21 3 12Z" fill={color} />
</BaseIcon>
