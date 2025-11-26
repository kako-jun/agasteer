<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M4 15.5 14.5 5l2.5 2.5L6.5 18H4v-2.5Z" fill={color} />
  <path d="M15.2 4.3 17.7 6.8 18.8 5.7 16.3 3.2Z" fill={color} />
</BaseIcon>
