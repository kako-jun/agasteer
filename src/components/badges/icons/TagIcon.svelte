<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M3 10.5 10.5 3H19v8.5L11.5 19 3 10.5Z" transform="translate(0 1)" fill={color} />
  <path d="M17 7.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" transform="translate(0 1)" fill={color} />
</BaseIcon>
