<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M12 2.5 14.5 7 19.5 4.5 17 9l4.5 2.5L17 14l2.5 4.5L14.5 16 12 20.5 9.5 16 4.5 18.5 7 14 2.5 11.5 7 9 4.5 4.5 9.5 7Z"
    fill={color}
  />
</BaseIcon>
