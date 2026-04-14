<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { ModalType } from '../../lib/types'
  import type { ModalPosition, ChoiceOption } from '../../lib/ui'

  interface Props {
    show: boolean
    message: string
    type: ModalType
    position?: ModalPosition
    onConfirm: (() => void) | null
    onCancel?: (() => void) | null
    onPromptSubmit?: ((value: string) => void) | null
    onChoiceSelect?: ((value: string) => void) | null
    choiceOptions?: ChoiceOption[]
    placeholder?: string
    onClose: () => void
  }

  let {
    show,
    message,
    type,
    position = 'center',
    onConfirm,
    onCancel = null,
    onPromptSubmit = null,
    onChoiceSelect = null,
    choiceOptions = [],
    placeholder = '',
    onClose,
  }: Props = $props()

  function handleClose() {
    if (onCancel) {
      onCancel()
    }
    // alertタイプは閉じ方に関わらずcallbackを実行
    if (type === 'alert' && onConfirm) {
      onConfirm()
    }
    onClose()
  }

  let inputValue = $state('')
  let inputElement: HTMLInputElement | null = $state(null)

  // モーダルが表示されたらフォーカス
  $effect(() => {
    if (show && type === 'prompt') {
      setTimeout(() => inputElement?.focus(), 0)
    }
  })

  // モーダルが閉じたら入力値をリセット
  $effect(() => {
    if (!show) {
      inputValue = ''
    }
  })

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

  function handleChoiceSelect(value: string) {
    if (onChoiceSelect) {
      onChoiceSelect(value)
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
  <div
    class="modal-overlay"
    class:bottom-left={position === 'bottom-left'}
    class:bottom-right={position === 'bottom-right'}
    onclick={handleClose}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }}
    role="button"
    tabindex="-1"
    aria-label={$_('common.close')}
  >
    <!-- role="dialog" にイベントハンドラを付けているのは、ダイアログ内のクリックがオーバーレイに伝播してモーダルが閉じるのを防止するため -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => {
        e.stopPropagation()
      }}
      onkeydown={(e) => {
        e.stopPropagation()
      }}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
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
          onkeydown={handleKeydown}
        />
      {/if}
      <div class="modal-buttons">
        {#if type === 'confirm'}
          <button class="secondary" onclick={handleClose}>{$_('common.cancel')}</button>
          <button class="primary" onclick={handleConfirm}>{$_('common.ok')}</button>
        {:else if type === 'prompt'}
          <button class="secondary" onclick={handleClose}>{$_('common.cancel')}</button>
          <button class="primary" onclick={handlePromptSubmit} disabled={!inputValue.trim()}
            >{$_('common.ok')}</button
          >
        {:else if type === 'choice'}
          <div class="choice-buttons">
            {#each choiceOptions as option}
              <button
                class={option.variant === 'primary'
                  ? 'primary'
                  : option.variant === 'cancel'
                    ? 'cancel'
                    : 'secondary'}
                onclick={() => handleChoiceSelect(option.value)}
              >
                <!-- icon は信頼済みSVG文字列のみ（PULL_ICON/PUSH_ICON等のハードコード定数）。ユーザー入力を渡さないこと -->
                {#if option.icon}{@html option.icon}{/if}
                {option.label}
              </button>
            {/each}
          </div>
        {:else}
          <button class="primary" onclick={handleConfirm}>{$_('common.ok')}</button>
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

  .modal-buttons button.cancel {
    background: var(--surface-1);
    color: var(--text-secondary);
  }

  .modal-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .choice-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .choice-buttons button {
    width: 100%;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .choice-buttons button :global(svg) {
    height: 1.2em;
    width: auto;
    flex-shrink: 0;
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
