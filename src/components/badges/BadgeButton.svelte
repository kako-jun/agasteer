<script lang="ts">
  import IconBadgePicker from './IconBadgePicker.svelte'

  interface Props {
    icon?: string
    color?: string
    onChange: (icon: string, color: string) => void
  }

  let { icon = '', color = '', onChange }: Props = $props()
</script>

<IconBadgePicker {icon} {color} {onChange} />
