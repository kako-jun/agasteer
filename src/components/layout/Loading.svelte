<div class="loading-overlay">
  <div class="loading-dots">
    <span class="dot dot-1">.</span>
    <span class="dot dot-2">.</span>
    <span class="dot dot-3">.</span>
  </div>
</div>

<style>
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    pointer-events: none;
  }

  .loading-dots {
    display: flex;
    gap: 0.25rem;
  }

  .dot {
    font-size: 2.5rem;
    color: var(--accent);
    animation: pulse 1.5s ease-in-out infinite;
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.5),
      0 0 8px rgba(0, 0, 0, 0.3);
    -webkit-text-stroke: 1px rgba(0, 0, 0, 0.3);
  }

  .dot-1 {
    animation-delay: 0s;
  }

  .dot-2 {
    animation-delay: 0.3s;
  }

  .dot-3 {
    animation-delay: 0.6s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
</style>
