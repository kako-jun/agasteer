<script lang="ts">
  import BaseIcon from './BaseIcon.svelte'
  export let color = 'currentColor'
</script>

<BaseIcon {color}>
  <circle cx="12" cy="12" r="4.75" fill={color} />
  <rect x="11" y="1.5" width="2" height="3" rx="1" fill={color} />
  <rect x="11" y="19.5" width="2" height="3" rx="1" fill={color} />
  <rect x="1.5" y="11" width="3" height="2" rx="1" fill={color} />
  <rect x="19.5" y="11" width="3" height="2" rx="1" fill={color} />
  <rect x="11" y="1.5" width="2" height="3" rx="1" fill={color} transform="rotate(45 12 12)" />
  <rect x="11" y="1.5" width="2" height="3" rx="1" fill={color} transform="rotate(-45 12 12)" />
  <rect x="11" y="19.5" width="2" height="3" rx="1" fill={color} transform="rotate(45 12 12)" />
  <rect x="11" y="19.5" width="2" height="3" rx="1" fill={color} transform="rotate(-45 12 12)" />
</BaseIcon>
