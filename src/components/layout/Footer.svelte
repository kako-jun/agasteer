<div class="footer-fixed">
  <slot name="left" />
  <div class="spacer" />
  <slot name="right" />
</div>

<style>
  .footer-fixed {
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-top: 1px solid rgba(0, 0, 0, 0.15);
    padding: 0 1rem;
    height: 40px;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-shrink: 0;
  }

  :global([data-theme='greenboard']) .footer-fixed,
  :global([data-theme='dotsD']) .footer-fixed,
  :global([data-theme='dotsF']) .footer-fixed {
    background: rgba(255, 255, 255, 0.15);
    border-top: 1px solid rgba(255, 255, 255, 0.15);
  }

  .spacer {
    flex: 1;
  }

  /* グローバルスタイル：フッター内のボタン */
  :global(.footer-fixed button) {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  :global(.footer-fixed button:hover) {
    opacity: 0.7;
  }

  :global(.footer-fixed button.primary) {
    color: var(--accent-color);
  }

  :global(.footer-fixed button.primary svg) {
    width: 20px;
    height: 20px;
  }

  :global(.footer-fixed button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.footer-fixed .button-icon) {
    margin: 0;
  }
</style>
