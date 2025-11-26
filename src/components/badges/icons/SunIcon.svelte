<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" fill={color} />
  <path
    d="M11 1.2h2V4h-2Zm0 17.8h2V22h-2ZM1.2 11h2.8v2H1.2ZM20 11h2.8v2H20Zm-3.3-7.5 1.4-1.4 1.9 1.9-1.4 1.4Zm-11.3 15 1.4-1.4 1.9 1.9-1.4 1.4Zm0-13.1 1.9-1.9 1.4 1.4-1.9 1.9Zm13.3 13.1 1.9-1.9 1.4 1.4-1.9 1.9Z"
    fill={color}
  />
</BaseIcon>
