<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <ellipse cx="11.1" cy="17.2" rx="3.2" ry="2.2" transform="rotate(-15 11.1 17.2)" fill={color} />
  <rect x="13" y="5" width="1.8" height="12" rx=".9" fill={color} />
  <path
    d="M15 5c3.1 1.1 5.1 3.6 5.1 6.6 0 1.3-.4 2.7-1 3.7-.3.6-.9.8-1.4.5-.5-.3-.6-1-.3-1.5.5-.9.7-2 .7-3 0-1.7-.8-3.3-2.4-4.4V5Z"
    fill={color}
  />
</BaseIcon>
