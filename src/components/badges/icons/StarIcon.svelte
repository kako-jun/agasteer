<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 2 14.9 8.3 22 9.1 17 13.8 18.4 21 12 17.3 5.6 21 7 13.8 2 9.1 9.1 8.3Z"
    fill={color}
  />
</BaseIcon>
