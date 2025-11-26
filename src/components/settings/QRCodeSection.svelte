<script lang="ts">
  import { _ } from '../../lib/i18n'
</script>

<div class="qr-code-container">
  <div class="qr-code-wrapper">
    <img src="/assets/qr.webp" alt="QR Code" class="qr-code-image" />
    <p class="qr-code-description">{$_('settings.qrCodeDescription')}</p>
  </div>
</div>

<style>
  .qr-code-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .qr-code-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .qr-code-image {
    width: 100px;
    height: 100px;
    object-fit: contain;
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
    background: white;
  }

  .qr-code-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
</style>
