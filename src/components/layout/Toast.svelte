<script lang="ts">
  export let pullMessage: string = ''
  export let pullVariant: 'success' | 'error' | '' = ''
  export let pushMessage: string = ''
  export let pushVariant: 'success' | 'error' | '' = ''
</script>

{#if pullMessage || pushMessage}
  <div class="toast-stack">
    {#if pullMessage}
      <div
        class="toast"
        class:success={pullVariant === 'success'}
        class:error={pullVariant === 'error'}
      >
        {pullMessage}
      </div>
    {/if}
    {#if pushMessage}
      <div
        class="toast"
        class:success={pushVariant === 'success'}
        class:error={pushVariant === 'error'}
      >
        {pushMessage}
      </div>
    {/if}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 2000;
    align-items: center;
  }

  .toast {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
    min-width: 140px;
    text-align: center;
  }

  .toast.success {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .toast.error {
    border-color: var(--error-color);
    color: var(--error-color);
  }
</style>
