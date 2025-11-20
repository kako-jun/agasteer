<script lang="ts">
  import type { ModalType } from '../../lib/types'

  export let show: boolean
  export let message: string
  export let type: ModalType
  export let onConfirm: (() => void) | null
  export let onClose: () => void

  function handleConfirm() {
    if (onConfirm) {
      onConfirm()
    }
    onClose()
  }
</script>

{#if show}
  <div class="modal-overlay" on:click={onClose}>
    <div class="modal-content" on:click|stopPropagation>
      <p>{message}</p>
      <div class="modal-buttons">
        {#if type === 'confirm'}
          <button on:click={handleConfirm}>OK</button>
          <button on:click={onClose}>キャンセル</button>
        {:else}
          <button on:click={onClose}>OK</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-primary);
    padding: 2rem;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
  }

  .modal-content p {
    margin-bottom: 1.5rem;
    color: var(--text-primary);
  }

  .modal-buttons {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .modal-buttons button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .modal-buttons button:first-child {
    background: var(--accent-color);
    color: white;
  }

  .modal-buttons button:last-child {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
</style>
