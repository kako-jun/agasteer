<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 3a5 5 0 0 1 5 5c0 4.3-5 10-5 10s-5-5.7-5-10a5 5 0 0 1 5-5Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
    fill={color}
  />
</BaseIcon>
