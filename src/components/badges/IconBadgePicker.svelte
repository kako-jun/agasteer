<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  const icons = [
    '★',
    '♥',
    '◆',
    '●',
    '■',
    '⬢',
    '▲',
    '▼',
    '▶',
    '◀',
    '☀',
    '☾',
    '☁',
    '✚',
    '✕',
    '✓',
    '✎',
    '♪',
    '＠',
    '＃',
    '＆',
    '！',
    '？',
    '✪',
  ]

  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#c7a443', '#ef4444']

  export let icon: string = ''
  export let color: string = ''
  export let onChange: (icon: string, color: string) => void

  let open = false
  const instanceId =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `badge-${Math.random().toString(36).slice(2)}`
  let containerEl: HTMLElement | null = null
  let panelTop = 0
  let panelLeft = 0

  function computePanelPosition() {
    const paneEl = containerEl?.closest('.left-column') || containerEl?.closest('.right-column')
    const rect = paneEl?.getBoundingClientRect()
    if (rect) {
      panelTop = rect.top + rect.height / 2
      panelLeft = rect.left + rect.width / 2
    } else if (containerEl) {
      const r = containerEl.getBoundingClientRect()
      panelTop = r.top + r.height / 2
      panelLeft = r.left + r.width / 2
    }
  }

  function toggleOpen(event: MouseEvent) {
    event.stopPropagation()
    const willOpen = !open
    open = willOpen
    if (willOpen) {
      computePanelPosition()
      window.dispatchEvent(new CustomEvent('icon-badge-open', { detail: instanceId }))
    }
  }

  function selectIcon(newIcon: string) {
    const nextColor = color || colors[0]
    onChange(newIcon, nextColor)
  }

  function selectColor(newColor: string) {
    const nextIcon = icon || icons[0]
    onChange(nextIcon, newColor)
  }

  $: computedColor = color || 'var(--text-muted)'

  function handleGlobalOpen(e: Event) {
    const detail = (e as CustomEvent<string>).detail
    if (detail !== instanceId) {
      open = false
    }
  }

  function handleOutsideClick(e: MouseEvent) {
    if (!open) return
    const panelEl = containerEl?.querySelector('.panel')
    if (panelEl && panelEl.contains(e.target as Node)) return
    if (containerEl && containerEl.contains(e.target as Node)) return
    open = false
  }

  onMount(() => {
    window.addEventListener('icon-badge-open', handleGlobalOpen as EventListener)
    window.addEventListener('pointerdown', handleOutsideClick)
  })

  onDestroy(() => {
    window.removeEventListener('icon-badge-open', handleGlobalOpen as EventListener)
    window.removeEventListener('pointerdown', handleOutsideClick)
  })
</script>

<div
  class="badge-container"
  class:has-icon={!!icon}
  role="presentation"
  on:click|stopPropagation
  on:keydown|stopPropagation
  tabindex="-1"
  bind:this={containerEl}
>
  <button
    class="badge"
    aria-label="badge"
    style={`color: ${computedColor}`}
    on:click|stopPropagation={toggleOpen}
    type="button"
  >
    {icon || '+'}
  </button>
  {#if open}
    <div class="panel" style={`top:${panelTop}px;left:${panelLeft}px`}>
      <div class="icons">
        <button
          type="button"
          class:active={!icon}
          on:click={() => onChange('', '')}
          aria-label="clear badge"
        ></button>
        {#each icons as ic}
          <button
            type="button"
            class:active={ic === icon}
            style={`color:${computedColor}`}
            on:click={() => selectIcon(ic)}
          >
            {ic}
          </button>
        {/each}
      </div>
      <div class="colors">
        {#each colors as c}
          <button
            type="button"
            class="color"
            class:active={c === color}
            style={`background:${c}`}
            aria-label={`color ${c}`}
            on:click={() => selectColor(c)}
          ></button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .badge-container {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
  }

  .badge {
    background: color-mix(in srgb, var(--text) 25%, var(--bg) 75%);
    border: 1px solid color-mix(in srgb, var(--text) 35%, var(--bg) 65%);
    border-radius: 999px;
    padding: 0.2rem 0.4rem;
    min-width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    opacity: 0;
    transition:
      opacity 0.2s,
      background-color 0.2s,
      border-color 0.2s;
  }

  .badge:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--text) 40%, var(--bg) 60%);
    border-color: var(--accent);
  }

  :global(.note-card:hover) .badge-container .badge,
  :global(.leaf-card:hover) .badge-container .badge {
    opacity: 0.8;
  }

  .badge-container.has-icon .badge {
    opacity: 1;
    background: transparent;
    border-color: transparent;
    padding: 0;
    min-width: auto;
    height: auto;
    box-shadow: none;
  }

  .badge-container.has-icon .badge:hover {
    opacity: 1;
  }

  .panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface-1, #fff);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
    z-index: 5;
    width: 220px;
  }

  .icons {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .icons button {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-1, #fff);
    cursor: pointer;
    padding: 0.35rem;
    font-size: 0.95rem;
    line-height: 1;
  }

  .icons button.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }

  .colors {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
  }

  .color {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .color.active {
    border-color: var(--border);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
  }
</style>
