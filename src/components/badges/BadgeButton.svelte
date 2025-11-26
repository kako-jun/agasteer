<script lang="ts">
  import IconBadgePicker from './IconBadgePicker.svelte'

  export let icon: string = ''
  export let color: string = ''
  export let onChange: (icon: string, color: string) => void
</script>

<IconBadgePicker {icon} {color} {onChange} />
