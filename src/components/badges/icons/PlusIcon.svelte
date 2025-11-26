<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill={color} />
</BaseIcon>
