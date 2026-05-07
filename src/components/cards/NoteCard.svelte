<script lang="ts">
  import { _ } from '../../lib/i18n'
  import type { Note } from '../../lib/types'
  import BadgeButton from '../badges/BadgeButton.svelte'

  interface Props {
    note: Note
    dragOver?: boolean
    isSelected?: boolean
    isDirty?: boolean
    onSelect: () => void
    onDragStart: () => void
    onDragEnd: () => void
    onDragOver: (e: DragEvent) => void
    onDrop: () => void
    items?: string[]
    isGroup?: boolean
    vimMode?: boolean
    badgeIcon?: string
    badgeColor?: string
    onBadgeChange: (icon: string, color: string) => void
  }

  let {
    note,
    dragOver = false,
    isSelected = false,
    isDirty = false,
    onSelect,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    items = [],
    isGroup = false,
    vimMode = false,
    badgeIcon = '',
    badgeColor = '',
    onBadgeChange,
  }: Props = $props()
</script>

<div
  class="note-card"
  class:note-group-card={isGroup}
  class:drag-over={dragOver}
  class:selected={vimMode && isSelected}
  draggable="true"
  role="button"
  tabindex="0"
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  ondragover={onDragOver}
  ondrop={(e) => {
    e.preventDefault()
    onDrop()
  }}
  onclick={onSelect}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }}
>
  {#if isDirty}
    <span class="dirty-indicator" title={$_('note.hasUnsavedLeaves')}></span>
  {/if}
  <BadgeButton icon={badgeIcon} color={badgeColor} onChange={onBadgeChange} />
  <div class="note-title">
    <svg class="folder-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M2 5a2 2 0 0 1 2-2h3.586A2 2 0 0 1 9 3.586L10.414 5H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z"
      />
    </svg><strong class="note-name text-ellipsis">{note.name}</strong>
  </div>
  <div class="card-meta">
    {#each items as item}
      <small class="note-item text-ellipsis">{item}</small>
    {/each}
  </div>
</div>

<style>
  .note-card {
    position: relative;
    /* #209: 左辺バインダー綴じ模様の帯（8px 幅、左端 0 に密着）と本文の間に
       余白を取るため、左 padding を増やす。他方向は 1rem 維持 */
    padding: 1rem 1rem 1rem 1.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-1);
    cursor: pointer;
    transition: all 0.2s;
    /* overflow: visible は維持（BadgeButton 等のドロップダウンが外に出る場合に備え）。
       バインダー模様は absolute で left:0 / width:8px なのでカード内に収まる */
    overflow: visible;
    /* 高さ固定: タイトル1行 + 4行のアイテム（3行+...）を表示できる高さ */
    height: 150px;
    min-height: 150px;
    max-height: 150px;
  }

  /* #209: バインダー綴じ風模様
     ノートカードの**左辺に密着**させた帯（左端 0px）に「2 本の細線 + 余白」を縦に反復させ、
     リングノートの綴じを連想させる。リーフカードには付けないことで識別性を高める。
     - 矩形の左端からそのまま生やす（border 上に重ねるのでカードの輪郭と一体化）
     - 色はテーマ accent の半透明で控えめに
     - 縦範囲は border-radius:8px の角丸が終わってから 5px 下を起点にし、対称に下も同じ余白
       （角丸を線で切ってしまうと不格好なので 13px = 角丸 8px + 余白 5px）
     - 横棒は 8px と長めにとってリングノートの綴じらしく（短いと「=」に見える）
     - 細線 1px x 2 本（間 2px）で 1 セット、セット周期 14px */
  .note-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 13px;
    bottom: 13px;
    width: 8px;
    background-image: repeating-linear-gradient(
      to bottom,
      var(--accent) 0 1px,
      transparent 1px 3px,
      var(--accent) 3px 4px,
      transparent 4px 14px
    );
    /* カード高さ 150px 固定 + top/bottom:13px → 縦範囲 124px。
       周期 14px とは割り切れず、デフォルトでは上余白 0 / 下余白 8px の不均衡が出る。
       gradient を 4px 下にオフセットして上下を対称（4px ずつ）にする。
       線位置: 4..5 / 7..8 / 18..19 / 21..22 / ... / 116..117 / 119..120 → 下余白 4px。 */
    background-position: 0 4px;
    opacity: 0.35;
    pointer-events: none;
  }

  .note-title {
    display: flex;
    align-items: center;
    gap: 0.3em;
    margin-bottom: 0.5rem;
  }

  .note-name {
    min-width: 0;
  }

  .folder-icon {
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    color: var(--accent);
    fill: currentColor;
  }

  .note-group-card {
    background: var(--surface-2);
  }

  .note-card:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .note-card.selected {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .card-meta {
    margin-top: 0.5rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 0.5rem; /* 抜粋は少しインデントして本文と区別 */
  }

  .note-item {
    display: block;
    max-width: 100%;
  }

  .drag-over {
    border-color: var(--accent);
    background: var(--surface-2);
    box-shadow: 0 0 0 2px var(--accent);
  }

  /* ダーティインジケーター（未保存の変更マーク） - カード右下に絶対位置で配置 */
  .dirty-indicator {
    position: absolute;
    bottom: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: #ef4444;
    border-radius: 50%;
  }
</style>
