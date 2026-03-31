<script lang="ts">
  interface Props {
    size?: number
    animate?: boolean
    ariaLabel?: string
    className?: string
    class?: string
    [key: string]: any
  }

  let {
    size = 100,
    animate = false,
    ariaLabel = 'Agasteer',
    className = '',
    class: restClass = '',
    ...restProps
  }: Props = $props()
</script>

<div
  {...restProps}
  class={`app-icon ${restClass} ${className}`.trim()}
  class:animate
  style={`width:${size}px;height:${size}px`}
  role="img"
  aria-label={ariaLabel}
></div>

<style>
  .app-icon {
    display: block;
    background-color: var(--accent);
    mask-image: url('/assets/agasteer-icon.webp');
    -webkit-mask-image: url('/assets/agasteer-icon.webp');
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    mask-size: contain;
    -webkit-mask-size: contain;
    mask-position: center;
    -webkit-mask-position: center;
    transform-origin: 50% 60%;
  }

  @supports not (mask-image: url('')) {
    .app-icon {
      background: url('/assets/agasteer-icon.png') center/contain no-repeat;
    }
  }

  .app-icon.animate {
    animation: leaf-drift 10s ease-in-out infinite;
    will-change: transform;
  }

  @keyframes leaf-drift {
    0% {
      transform: translateY(0) rotate(0deg) scale(1, 1);
    }
    20% {
      transform: translateY(-4px) rotate(-4deg) scale(0.97, 1.03);
    }
    45% {
      transform: translateY(5px) rotate(6deg) scale(1.03, 0.96);
    }
    70% {
      transform: translateY(-3px) rotate(-3deg) scale(0.98, 1.02);
    }
    100% {
      transform: translateY(0) rotate(0deg) scale(1, 1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .app-icon.animate {
      animation: none;
    }
  }
</style>
