<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 21s-6-3.5-6-9c0-3 2.2-5 4.7-5 1 0 1.9.4 2.3 1.2.4-.8 1.3-1.2 2.3-1.2C17.8 7 20 9 20 12c0 5.5-8 9-8 9Z"
    fill={color}
  />
</BaseIcon>
