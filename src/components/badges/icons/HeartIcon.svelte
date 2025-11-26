<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 21s-6.6-3.9-6.6-9.6C5.4 8.2 7.6 6 10 6c1.3 0 2.4.6 3 1.5C13.6 6.6 14.7 6 16 6c2.4 0 4.6 2.2 4.6 5.4C20.6 17.1 12 21 12 21Z"
    fill={color}
  />
</BaseIcon>
