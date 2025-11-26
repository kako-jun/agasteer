<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" fill={color} />
  <path
    d="M11 1h2v3h-2Zm0 19h2v3h-2Zm9-8v2h3v-2Zm-22 0v2h3v-2Zm3.9-7 1.4-1.4 2.1 2.1-1.4 1.4Zm13.2 13.2 1.4-1.4 2.1 2.1-1.4 1.4ZM4.3 18.6 6.4 16.5 7.8 17.9 5.7 20Zm13.4-13.2 2.1-2.1L21.2 5 19.1 7.1Z"
    fill={color}
  />
</BaseIcon>
