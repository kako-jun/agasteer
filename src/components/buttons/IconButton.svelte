<script lang="ts">
  interface Props {
    onClick: () => void
    title?: string
    ariaLabel?: string
    disabled?: boolean
    variant?: 'default' | 'primary'
    iconSize?: number
    iconWidth?: number | null
    iconHeight?: number | null
    onMouseEnter?: (() => void) | null
    children?: import('svelte').Snippet
  }

  let {
    onClick,
    title = '',
    ariaLabel = '',
    disabled = false,
    variant = 'default',
    iconSize = 18,
    iconWidth = null,
    iconHeight = null,
    onMouseEnter = null,
    children,
  }: Props = $props()
</script>

<button
  type="button"
  onclick={onClick}
  onmouseenter={() => onMouseEnter?.()}
  {title}
  aria-label={ariaLabel}
  {disabled}
  class="icon-button"
  class:primary={variant === 'primary'}
  style={`--icon-width: ${iconWidth ?? iconSize}px; --icon-height: ${iconHeight ?? iconSize}px;`}
>
  {@render children?.()}
</button>

<style>
  .icon-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
    position: relative;
  }

  .icon-button:hover:not(:disabled) {
    opacity: 0.7;
  }

  .icon-button.primary {
    color: var(--accent);
  }

  .icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-button :global(svg) {
    width: var(--icon-width);
    height: var(--icon-height);
  }
</style>
