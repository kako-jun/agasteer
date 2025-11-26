<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M10 6v8.5c0 1.4-1.1 2.5-2.5 2.5S5 15.9 5 14.5 6.1 12 7.5 12c.7 0 1.3.2 1.7.6V6h9v7.5c0 1.4-1.1 2.5-2.5 2.5S13 14.9 13 13.5 14.1 11 15.5 11c.7 0 1.3.2 1.7.6V8h-7Z"
    fill={color}
  />
</BaseIcon>
