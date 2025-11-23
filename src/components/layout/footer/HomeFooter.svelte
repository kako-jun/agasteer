<script lang="ts">
  import { _ } from '../../../lib/i18n'
  import Footer from '../Footer.svelte'

  export let onCreateNote: () => void
  export let onSave: () => void
  export let disabled: boolean
  export let isDirty: boolean
</script>

<Footer>
  <svelte:fragment slot="left">
    <button
      type="button"
      on:click={onCreateNote}
      title={$_('footer.newNote')}
      aria-label={$_('footer.newNote')}
      {disabled}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="button-icon"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    </button>
  </svelte:fragment>
  <svelte:fragment slot="right">
    <button
      type="button"
      class="primary save-button"
      on:click={onSave}
      title={$_('common.save')}
      aria-label={$_('common.save')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="button-icon"
      >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      {#if isDirty}
        <span class="notification-badge"></span>
      {/if}
    </button>
  </svelte:fragment>
</Footer>
