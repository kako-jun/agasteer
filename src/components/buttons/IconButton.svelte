<script lang="ts">
  export let onClick: () => void
  export let title = ''
  export let ariaLabel = ''
  export let disabled = false
  export let variant: 'default' | 'primary' = 'default'
  export let iconSize = 18
  export let iconWidth: number | null = null
  export let iconHeight: number | null = null
</script>

<button
  type="button"
  on:click={onClick}
  {title}
  aria-label={ariaLabel}
  {disabled}
  class="icon-button"
  class:primary={variant === 'primary'}
  style={`--icon-width: ${iconWidth ?? iconSize}px; --icon-height: ${iconHeight ?? iconSize}px;`}
>
  <slot />
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
