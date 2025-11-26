<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  type IconDef = { id: string; paths: string[] }

  const legacyIconMap: Record<string, string> = {
    '★': 'star',
    '♥': 'heart',
    '❤': 'heart',
    '◆': 'diamond',
    '◇': 'diamond',
    '●': 'circle',
    '○': 'circle',
    '■': 'square',
    '⬤': 'circle',
    '⬛': 'square',
    '⬢': 'hexagon',
    '▲': 'triangle-up',
    '▼': 'triangle-down',
    '▶': 'play',
    '◀': 'back',
    '☀': 'sun',
    '☾': 'moon',
    '☁': 'cloud',
    '✚': 'plus',
    '+': 'plus',
    '✕': 'cross',
    '×': 'cross',
    '✓': 'check',
    '✔': 'check',
    '✎': 'edit',
    '♪': 'music',
    '＠': 'tag',
    '＃': 'hash',
    '#': 'hash',
    '＆': 'amp',
    '&': 'amp',
    '！': 'alert',
    '!': 'alert',
    '？': 'question',
    '?': 'question',
    '✪': 'starburst',
    '◉': 'target',
  }

  const icons: IconDef[] = [
    {
      id: 'star',
      paths: ['M12 2 14.9 8.3 22 9.1 17 13.8 18.4 21 12 17.3 5.6 21 7 13.8 2 9.1 9.1 8.3Z'],
    },
    {
      id: 'heart',
      paths: ['M12 21s-7-4.3-7-10a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 19 11c0 5.7-7 10-7 10Z'],
    },
    { id: 'diamond', paths: ['M12 3 21 12 12 21 3 12Z'] },
    { id: 'circle', paths: ['M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z'] },
    { id: 'square', paths: ['M6 6h12v12H6Z'] },
    { id: 'hexagon', paths: ['M12 3 20 8v8l-8 5-8-5V8Z'] },
    { id: 'triangle-up', paths: ['M12 4 20 18H4Z'] },
    { id: 'triangle-down', paths: ['M4 6h16L12 20Z'] },
    { id: 'play', paths: ['M8 5l10 7-10 7Z'] },
    { id: 'back', paths: ['M16 5 6 12l10 7Z'] },
    { id: 'plus', paths: ['M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z'] },
    {
      id: 'cross',
      paths: [
        'M6 7.4 7.4 6 12 10.6 16.6 6 18 7.4 13.4 12 18 16.6 16.6 18 12 13.4 7.4 18 6 16.6 10.6 12Z',
      ],
    },
    { id: 'check', paths: ['M5 13l3-3 3 3 6-6 2 2-8 8-5-5Z'] },
    {
      id: 'edit',
      paths: ['M4 15.5 14.5 5l2.5 2.5L6.5 18H4v-2.5Z', 'M15.2 4.3 17.7 6.8 18.8 5.7 16.3 3.2Z'],
    },
    {
      id: 'music',
      paths: [
        'M9 6v11.2a2.2 2.2 0 1 1-2-2.2c.7 0 1.3.3 1.7.7V6h8v7.2a2.2 2.2 0 1 1-2-2.2c.7 0 1.3.3 1.7.7V6H9Z',
      ],
    },
    { id: 'bookmark', paths: ['M6 4h12v16l-6-3-6 3Z'] },
    { id: 'flag', paths: ['M6 4h9l-1.2 3L16 10H6v7H4V4h2Z'] },
    {
      id: 'pin',
      paths: [
        'M12 3a5 5 0 0 1 5 5c0 4.3-5 10-5 10s-5-5.7-5-10a5 5 0 0 1 5-5Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
      ],
    },
    { id: 'chat', paths: ['M4 5h16v10H8l-4 4Z'] },
    { id: 'bolt', paths: ['M13 2 6 13h4l-1 9 8-12h-4Z'] },
    {
      id: 'tag',
      paths: ['M3 10.5 10.5 3H19v8.5L11.5 19 3 10.5Zm14-3a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z'],
    },
    {
      id: 'eye',
      paths: [
        'M12 6c5.5 0 9.5 6 9.5 6s-4 6-9.5 6S2.5 12 2.5 12 6.5 6 12 6Zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
      ],
    },
    { id: 'cloud', paths: ['M7 16a4 4 0 0 1 0-8 5 5 0 0 1 9.2-1.7A3.5 3.5 0 0 1 17.5 16H7Z'] },
    { id: 'moon', paths: ['M15 3a7 7 0 1 0 6 11.8A6 6 0 1 1 15 3Z'] },
    {
      id: 'sun',
      paths: [
        'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
        'M11 1h2v3h-2Zm0 19h2v3h-2Zm9-8v2h3v-2Zm-22 0v2h3v-2Zm3.9-7 1.4-1.4 2.1 2.1-1.4 1.4Zm13.2 13.2 1.4-1.4 2.1 2.1-1.4 1.4ZM4.3 18.6 6.4 16.5 7.8 17.9 5.7 20Zm13.4-13.2 2.1-2.1L21.2 5 19.1 7.1Z',
      ],
    },
    {
      id: 'starburst',
      paths: [
        'M12 2.5 14.5 7 19.5 4.5 17 9l4.5 2.5L17 14l2.5 4.5L14.5 16 12 20.5 9.5 16 4.5 18.5 7 14 2.5 11.5 7 9 4.5 4.5 9.5 7Z',
      ],
    },
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
  $: resolvedIcon = legacyIconMap[icon] ?? icon
  $: currentIconDef = icons.find((i) => i.id === resolvedIcon)

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
    const nextIcon = resolvedIcon || icons[0].id
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
    {#if currentIconDef}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#each currentIconDef.paths as d}
          <path {d} fill={computedColor} />
        {/each}
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill={computedColor} />
      </svg>
    {/if}
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
            class:active={resolvedIcon === ic.id}
            on:click={() => selectIcon(ic.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#each ic.paths as d}
                <path {d} fill={computedColor} />
              {/each}
            </svg>
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
    background: transparent;
    border: none;
    border-radius: 999px;
    padding: 0;
    min-width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    opacity: 0.4;
    transition: opacity 0.2s;
  }

  .badge:hover {
    opacity: 1;
  }

  :global(.note-card:hover) .badge-container .badge,
  :global(.leaf-card:hover) .badge-container .badge {
    opacity: 0.7;
  }

  .badge-container.has-icon .badge {
    opacity: 1;
    background: transparent;
    border: none;
    padding: 0;
    min-width: 1.5rem;
    height: 1.5rem;
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
    gap: 1px;
    margin-bottom: 0.5rem;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .icons button {
    border: none;
    background: var(--surface-1, #fff);
    cursor: pointer;
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    border-radius: 0;
  }

  .icons button.active {
    background: color-mix(in srgb, var(--accent) 15%, var(--surface-1) 85%);
  }

  .colors {
    display: flex;
    gap: 0.4rem;
    justify-content: space-between;
    padding: 0 0.2rem;
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
