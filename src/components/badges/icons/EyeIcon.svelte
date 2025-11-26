<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 6c5.5 0 9.5 6 9.5 6s-4 6-9.5 6S2.5 12 2.5 12 6.5 6 12 6Z"
    fill="none"
    stroke={color}
    stroke-width="2"
  />
  <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill={color} />
</BaseIcon>
