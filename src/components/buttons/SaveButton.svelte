<script lang="ts">
  import { _ } from '../../lib/i18n'
  import IconButton from './IconButton.svelte'
  import OctocatPushIcon from '../icons/OctocatPushIcon.svelte'

  export let onSave: () => void
  export let isDirty: boolean
  export let disabled: boolean = false
</script>

<div class="save-button-wrapper">
  <IconButton
    onClick={onSave}
    title={$_('common.save')}
    ariaLabel={$_('common.save')}
    variant="primary"
    iconWidth={32}
    iconHeight={20}
    {disabled}
  >
    <OctocatPushIcon />
  </IconButton>
  {#if isDirty}
    <span class="notification-badge"></span>
  {/if}
</div>

<style>
  .save-button-wrapper {
    position: relative;
  }

  .notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
    pointer-events: none;
  }
</style>
