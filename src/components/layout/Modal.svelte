<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { ModalType } from '../../lib/types'
  import type { ModalPosition } from '../../lib/ui'

  export let show: boolean
  export let message: string
  export let type: ModalType
  export let position: ModalPosition = 'center'
  export let onConfirm: (() => void) | null
  export let onCancel: (() => void) | null = null
  export let onPromptSubmit: ((value: string) => void) | null = null
  export let placeholder: string = ''
  export let onClose: () => void

  function handleClose() {
    if (onCancel) {
      onCancel()
    }
    onClose()
  }

  let inputValue = ''
  let inputElement: HTMLInputElement | null = null

  // モーダルが表示されたらフォーカス
  $: if (show && type === 'prompt') {
    setTimeout(() => inputElement?.focus(), 0)
  }

  // モーダルが閉じたら入力値をリセット
  $: if (!show) {
    inputValue = ''
  }

  function handleConfirm() {
    if (onConfirm) {
      onConfirm()
    }
    onClose()
  }

  function handlePromptSubmit() {
    const value = inputValue.trim()
    if (value && onPromptSubmit) {
      onPromptSubmit(value)
    }
    onClose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (type === 'prompt') {
      if (e.key === 'Enter') {
        e.preventDefault()
        handlePromptSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="modal-overlay"
    class:bottom-left={position === 'bottom-left'}
    class:bottom-right={position === 'bottom-right'}
    on:click={handleClose}
    role="presentation"
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true">
      {#each message.split('\n') as line}
        <p>{line}</p>
      {/each}
      {#if type === 'prompt'}
        <input
          bind:this={inputElement}
          bind:value={inputValue}
          type="text"
          class="prompt-input"
          {placeholder}
          on:keydown={handleKeydown}
        />
      {/if}
      <div class="modal-buttons">
        {#if type === 'confirm'}
          <button class="secondary" on:click={handleClose}>{$_('common.cancel')}</button>
          <button class="primary" on:click={handleConfirm}>{$_('common.ok')}</button>
        {:else if type === 'prompt'}
          <button class="secondary" on:click={handleClose}>{$_('common.cancel')}</button>
          <button class="primary" on:click={handlePromptSubmit} disabled={!inputValue.trim()}
            >{$_('common.ok')}</button
          >
        {:else}
          <button class="primary" on:click={onClose}>{$_('common.ok')}</button>
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

  .modal-overlay.bottom-left {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 0;
    padding-bottom: 40px;
  }

  .modal-overlay.bottom-left .modal-content {
    border-radius: 0 10px 0 0;
  }

  .modal-overlay.bottom-right {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 0;
    padding-bottom: 40px;
    padding-left: 50%;
  }

  .modal-overlay.bottom-right .modal-content {
    border-radius: 0 10px 0 0;
  }

  .modal-content {
    background: var(--bg);
    padding: 2rem;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
  }

  .modal-content p {
    margin-bottom: 1.5rem;
    color: var(--text);
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

  .modal-buttons button.primary {
    background: var(--accent);
    color: white;
  }

  .modal-buttons button.secondary {
    background: var(--surface-1);
    color: var(--text);
  }

  .modal-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .prompt-input {
    width: 100%;
    padding: 0.5rem;
    margin-bottom: 1rem;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 1rem;
  }

  .prompt-input:focus {
    outline: none;
    border-color: var(--accent);
  }
</style>
