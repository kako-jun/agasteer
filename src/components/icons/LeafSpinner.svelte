<script lang="ts">
  import { fade } from 'svelte/transition'

  interface Props {
    size?: number
    overlay?: boolean
  }

  let { size = 32, overlay = false }: Props = $props()
</script>

{#if overlay}
  <div
    class="leaf-spinner-overlay"
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 400 }}
    role="status"
    aria-label="Loading"
  >
    <div class="leaf-spinner" style="width:{size}px;height:{size}px"></div>
  </div>
{:else}
  <div
    class="leaf-spinner-container"
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 400 }}
    role="status"
    aria-label="Loading"
  >
    <div class="leaf-spinner" style="width:{size}px;height:{size}px"></div>
  </div>
{/if}

<style>
  .leaf-spinner-overlay {
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

  .leaf-spinner-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .leaf-spinner {
    background-color: var(--accent);
    mask-image: url('/assets/agasteer-icon.webp');
    -webkit-mask-image: url('/assets/agasteer-icon.webp');
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    mask-size: contain;
    -webkit-mask-size: contain;
    mask-position: center;
    -webkit-mask-position: center;
    animation: leaf-spin 2.4s ease-in-out infinite;
    will-change: transform;
  }

  @keyframes leaf-spin {
    0% {
      transform: perspective(400px) rotateY(0deg) rotateZ(0deg) translateY(0px) scale(1, 1);
      opacity: 1;
    }
    12% {
      transform: perspective(400px) rotateY(45deg) rotateZ(5deg) translateY(-3px) scale(0.85, 1.1);
      opacity: 0.7;
    }
    25% {
      transform: perspective(400px) rotateY(90deg) rotateZ(10deg) translateY(-6px) scale(0.7, 1.15);
      opacity: 0.4;
    }
    37% {
      transform: perspective(400px) rotateY(135deg) rotateZ(4deg) translateY(-2px) scale(0.9, 0.95);
      opacity: 0.7;
    }
    50% {
      transform: perspective(400px) rotateY(180deg) rotateZ(0deg) translateY(0px) scale(1.08, 0.88);
      opacity: 1;
    }
    62% {
      transform: perspective(400px) rotateY(225deg) rotateZ(-6deg) translateY(3px) scale(0.88, 1.12);
      opacity: 0.7;
    }
    75% {
      transform: perspective(400px) rotateY(270deg) rotateZ(-10deg) translateY(6px) scale(0.75, 1.1);
      opacity: 0.4;
    }
    87% {
      transform: perspective(400px) rotateY(315deg) rotateZ(-3deg) translateY(2px) scale(0.92, 0.96);
      opacity: 0.7;
    }
    100% {
      transform: perspective(400px) rotateY(360deg) rotateZ(0deg) translateY(0px) scale(1, 1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .leaf-spinner {
      animation: none;
      opacity: 0.7;
      will-change: auto;
    }
  }
</style>
