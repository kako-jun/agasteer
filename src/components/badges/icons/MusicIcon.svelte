<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path
    d="M9 6v11.2a2.2 2.2 0 1 1-2-2.2c.7 0 1.3.3 1.7.7V6h8v7.2a2.2 2.2 0 1 1-2-2.2c.7 0 1.3.3 1.7.7V6H9Z"
    fill={color}
  />
</BaseIcon>
