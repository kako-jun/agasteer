<script lang="ts">
  import QRCode from 'qrcode'
  import { _ } from '../lib/i18n'

  export let getContent: () => string
  export let hasSelection: boolean = false

  // QRコードの最大容量（誤り訂正レベルL、バイナリモード）
  const QR_MAX_BYTES = 2953

  let showModal = false
  let qrDataUrl: string | null = null

  function getByteLength(str: string): number {
    return new TextEncoder().encode(str).length
  }

  // 同期的にバイト数をチェック
  $: content = getContent()
  $: byteLength = getByteLength(content)
  $: qrExceeded = byteLength > QR_MAX_BYTES

  // QRコードのバージョンに応じた最小モジュール数を取得
  function getModuleCount(dataLength: number): number {
    // 概算: 文字数に応じてモジュール数が増える
    // バージョン1: 21x21, バージョン40: 177x177
    if (dataLength < 50) return 21
    if (dataLength < 100) return 25
    if (dataLength < 200) return 33
    if (dataLength < 500) return 57
    if (dataLength < 1000) return 89
    if (dataLength < 2000) return 125
    return 177
  }

  async function openModal() {
    if (qrExceeded) return

    showModal = true

    try {
      // モジュール数に応じてQRコードサイズを決定
      // 各モジュールが最低3ピクセルになるようにする
      const moduleCount = getModuleCount(byteLength)
      const qrSize = Math.max(300, moduleCount * 3)

      qrDataUrl = await QRCode.toDataURL(content, {
        errorCorrectionLevel: 'L',
        margin: 2,
        width: qrSize,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
    } catch (err) {
      console.error('QRコード生成エラー:', err)
      qrDataUrl = null
    }
  }

  function closeModal() {
    showModal = false
    qrDataUrl = null
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (showModal && event.key === 'Escape') {
      closeModal()
    }
  }

  // ポータルアクション: 要素をbody直下に移動（transformを持つ親の影響を回避）
  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
      },
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if !qrExceeded}
  <div class="qr-divider" />
  <button class="menu-item qr-button" on:click={openModal}>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
    <span>{hasSelection ? $_('share.showSelectionQRCode') : $_('share.showMarkdownQRCode')}</span>
  </button>
{/if}

{#if showModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="qr-modal-backdrop" use:portal on:click={handleBackdropClick}>
    <div class="qr-modal">
      <button class="qr-close-button" on:click={closeModal} aria-label="Close">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      {#if qrDataUrl}
        <img src={qrDataUrl} alt="QR Code" class="qr-image" />
      {:else}
        <div class="qr-loading">{$_('common.loading')}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .qr-divider {
    height: 1px;
    background: var(--text-muted);
    opacity: 0.3;
    margin: 0.5rem 0;
  }

  .qr-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s;
    font-size: 0.9rem;
  }

  .qr-button:hover {
    background: var(--surface-1);
  }

  .qr-button svg {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .qr-button span {
    flex: 1;
    text-align: left;
  }

  /* ポータルでbody直下に移動されるため:global()が必要 */
  :global(.qr-modal-backdrop) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: qr-fadeIn 0.2s ease-out;
  }

  @keyframes qr-fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  :global(.qr-modal) {
    position: relative;
    background: white;
    border-radius: 4px;
    padding: 0.25rem;
    max-width: 98vw;
    max-height: 98vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.qr-close-button) {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 50%;
    transition: background 0.15s;
    z-index: 1;
  }

  :global(.qr-close-button:hover) {
    background: rgba(0, 0, 0, 0.9);
  }

  :global(.qr-image) {
    max-width: 97vw;
    max-height: 97vh;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  :global(.qr-loading) {
    padding: 2rem;
    color: #666;
  }
</style>
