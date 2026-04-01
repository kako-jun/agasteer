<script lang="ts">
  import { _ } from 'svelte-i18n'
  import { onDestroy } from 'svelte'
  import type { Pane } from '../../lib/navigation'
  import { recognizeText } from '../../lib/ocr'
  import LeafSpinner from '../icons/LeafSpinner.svelte'
  import CameraIcon from '../icons/CameraIcon.svelte'

  interface Props {
    show: boolean
    pane?: Pane
    onComplete: (text: string) => void
    onClose: () => void
  }

  let { show, pane = 'left', onComplete, onClose }: Props = $props()

  let step: 'select' | 'camera' | 'preview' | 'processing' = $state('select')
  let imageBlob: Blob | null = $state(null)
  let imageUrl: string | null = $state(null)
  let mediaStream: MediaStream | null = $state(null)
  let videoEl: HTMLVideoElement | null = $state(null)
  let fileInput: HTMLInputElement | null = $state(null)
  let errorMessage: string | null = $state(null)

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop())
      mediaStream = null
    }
  }

  function resetState() {
    stopCamera()
    step = 'select'
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      imageUrl = null
    }
    imageBlob = null
    errorMessage = null
  }

  function close() {
    resetState()
    onClose()
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close()
    }
  }

  // select step
  async function openCamera() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      step = 'camera'
      // $effect will attach stream to video element
    } catch {
      errorMessage = $_('ocr.cameraError')
      step = 'select'
    }
  }

  function openFilePicker() {
    fileInput?.click()
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      imageBlob = file
      imageUrl = URL.createObjectURL(file)
      step = 'preview'
    }
    // Reset input so same file can be selected again
    input.value = ''
  }

  // camera step
  function capture() {
    if (!videoEl) return
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoEl, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) {
        stopCamera()
        imageBlob = blob
        imageUrl = URL.createObjectURL(blob)
        step = 'preview'
      }
    }, 'image/png')
  }

  function backToSelect() {
    stopCamera()
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      imageUrl = null
    }
    imageBlob = null
    step = 'select'
  }

  // preview step
  async function startRecognition() {
    if (!imageBlob) return
    step = 'processing'
    try {
      const text = await recognizeText(imageBlob)
      onComplete(text)
      resetState()
    } catch {
      errorMessage = $_('ocr.error')
      resetState()
    }
  }

  // Attach media stream to video element when camera step is active
  $effect(() => {
    if (step === 'camera' && videoEl && mediaStream) {
      videoEl.srcObject = mediaStream
    }
  })

  // Reset state when modal is shown
  $effect(() => {
    if (show) {
      step = 'select'
      errorMessage = null
    }
  })

  onDestroy(() => {
    stopCamera()
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }
  })
</script>

{#if show}
  <div
    class="ocr-overlay"
    class:right-pane={pane === 'right'}
    onclick={close}
    onkeydown={handleOverlayKeydown}
    role="button"
    tabindex="-1"
    aria-label={$_('ocr.back')}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="ocr-modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-modal-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <h2 id="ocr-modal-title">{$_('ocr.title')}</h2>
      </div>

      {#if step === 'select'}
        <div class="choice-buttons">
          <button class="choice-button" onclick={openCamera}>
            <CameraIcon />
            {$_('ocr.fromCamera')}
          </button>
          <button class="choice-button" onclick={openFilePicker}>
            {$_('ocr.fromFile')}
          </button>
        </div>
        <input
          bind:this={fileInput}
          type="file"
          accept="image/*"
          class="hidden-input"
          onchange={handleFileChange}
        />
        {#if errorMessage}
          <p class="error-text">{errorMessage}</p>
        {/if}
      {:else if step === 'camera'}
        <div class="camera-container">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} autoplay playsinline class="camera-preview"></video>
        </div>
        <div class="actions">
          <button class="ghost" onclick={backToSelect}>{$_('ocr.back')}</button>
          <button class="primary" onclick={capture}>
            <CameraIcon />
            {$_('ocr.capture')}
          </button>
        </div>
      {:else if step === 'preview'}
        <div class="preview-container">
          {#if imageUrl}
            <img src={imageUrl} alt="Preview" class="image-preview" />
          {/if}
        </div>
        <div class="actions">
          <button class="ghost" onclick={backToSelect}>{$_('ocr.back')}</button>
          <button class="primary" onclick={startRecognition}>{$_('ocr.recognize')}</button>
        </div>
      {:else if step === 'processing'}
        <div class="processing-container">
          <LeafSpinner size={28} />
          <p class="processing-text">{$_('ocr.processing')}</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ocr-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: flex-start;
    z-index: 1000;
    padding: 0;
    padding-bottom: 40px;
  }

  .ocr-overlay.right-pane {
    justify-content: flex-start;
    padding-left: 50%;
  }

  .ocr-modal {
    width: min(520px, 100%);
    max-height: 90vh;
    background: var(--bg);
    border-radius: 0 10px 0 0;
    padding: 1.25rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
    writing-mode: horizontal-tb;
    direction: ltr;
  }

  .ocr-modal * {
    writing-mode: horizontal-tb;
    direction: ltr;
    color: var(--text);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .choice-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .choice-button {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface-1);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
    font-size: inherit;
    font-family: inherit;
    transition: background 0.12s ease;
  }

  .choice-button:hover {
    background: var(--surface-2);
  }

  .choice-button :global(svg) {
    width: 18px;
    height: 18px;
  }

  .hidden-input {
    display: none;
  }

  .camera-container {
    display: flex;
    justify-content: center;
  }

  .camera-preview {
    max-height: 300px;
    max-width: 100%;
    object-fit: contain;
    border-radius: 6px;
    background: #000;
  }

  .preview-container {
    display: flex;
    justify-content: center;
  }

  .image-preview {
    max-height: 300px;
    max-width: 100%;
    object-fit: contain;
    border-radius: 6px;
  }

  .processing-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 0;
  }

  .processing-text {
    margin: 0;
    color: var(--text-muted);
  }

  .error-text {
    margin: 0;
    color: var(--error, #e53e3e);
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .ghost,
  .primary {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .ghost {
    background: var(--surface-1);
  }

  .primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .primary :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
