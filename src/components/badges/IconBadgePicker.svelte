<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import BackIcon from './icons/BackIcon.svelte'
  import BoltIcon from './icons/BoltIcon.svelte'
  import BookmarkIcon from './icons/BookmarkIcon.svelte'
  import CheckIcon from './icons/CheckIcon.svelte'
  import CircleIcon from './icons/CircleIcon.svelte'
  import CloudIcon from './icons/CloudIcon.svelte'
  import CrossIcon from './icons/CrossIcon.svelte'
  import DiamondIcon from './icons/DiamondIcon.svelte'
  import EditIcon from './icons/EditIcon.svelte'
  import EyeIcon from './icons/EyeIcon.svelte'
  import FlagIcon from './icons/FlagIcon.svelte'
  import HeartIcon from './icons/HeartIcon.svelte'
  import HexagonIcon from './icons/HexagonIcon.svelte'
  import MoonIcon from './icons/MoonIcon.svelte'
  import MusicIcon from './icons/MusicIcon.svelte'
  import PinIcon from './icons/PinIcon.svelte'
  import PlayIcon from './icons/PlayIcon.svelte'
  import SquareIcon from './icons/SquareIcon.svelte'
  import StarIcon from './icons/StarIcon.svelte'
  import StarburstIcon from './icons/StarburstIcon.svelte'
  import SunIcon from './icons/SunIcon.svelte'
  import TagIcon from './icons/TagIcon.svelte'
  import TriangleDownIcon from './icons/TriangleDownIcon.svelte'
  import TriangleUpIcon from './icons/TriangleUpIcon.svelte'

  const iconComponents = {
    star: StarIcon,
    heart: HeartIcon,
    diamond: DiamondIcon,
    circle: CircleIcon,
    square: SquareIcon,
    hexagon: HexagonIcon,
    'triangle-up': TriangleUpIcon,
    'triangle-down': TriangleDownIcon,
    play: PlayIcon,
    back: BackIcon,
    cross: CrossIcon,
    check: CheckIcon,
    edit: EditIcon,
    music: MusicIcon,
    bookmark: BookmarkIcon,
    flag: FlagIcon,
    pin: PinIcon,
    bolt: BoltIcon,
    tag: TagIcon,
    eye: EyeIcon,
    cloud: CloudIcon,
    moon: MoonIcon,
    sun: SunIcon,
    starburst: StarburstIcon,
  } as const

  type IconId = keyof typeof iconComponents

  const legacyIconMap: Record<string, IconId> = {
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
    '✕': 'cross',
    '×': 'cross',
    '✓': 'check',
    '✔': 'check',
    '✎': 'edit',
    '♪': 'music',
    '＠': 'tag',
    '＃': 'tag',
    '#': 'tag',
    '＆': 'tag',
    '&': 'tag',
    '✪': 'starburst',
  }

  const icons: IconId[] = [
    'star',
    'heart',
    'diamond',
    'circle',
    'square',
    'hexagon',
    'triangle-up',
    'triangle-down',
    'play',
    'back',
    'cross',
    'check',
    'edit',
    'music',
    'flag',
    'pin',
    'bolt',
    'bookmark',
    'tag',
    'eye',
    'cloud',
    'moon',
    'sun',
    'starburst',
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
  $: resolvedIcon = (legacyIconMap[icon] ?? icon) as IconId | string
  $: currentIconComponent =
    typeof resolvedIcon === 'string' && resolvedIcon in iconComponents
      ? iconComponents[resolvedIcon as IconId]
      : null

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
    const nextIcon = (resolvedIcon as IconId) || icons[0]
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
    {#if currentIconComponent}
      <svelte:component this={currentIconComponent} color={computedColor} />
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
          <button type="button" class:active={resolvedIcon === ic} on:click={() => selectIcon(ic)}>
            <svelte:component this={iconComponents[ic]} color={computedColor} />
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
