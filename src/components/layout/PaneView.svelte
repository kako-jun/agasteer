<script lang="ts">
  import { getContext } from 'svelte'
  import type { Writable } from 'svelte/store'
  import type { Pane } from '../../lib/navigation'
  import type { PaneActions, PaneState, PANE_ACTIONS_KEY, PANE_STATE_KEY } from '../../lib/stores'
  import type { Note, Leaf, View } from '../../lib/types'
  import {
    isPriorityLeaf,
    isOfflineLeaf,
    generatePriorityPlainText,
    priorityItems,
  } from '../../lib/utils'

  // ストア
  import {
    settings,
    notes,
    leaves,
    rootNotes,
    archiveNotes,
    archiveLeaves,
    metadata,
    archiveMetadata,
    isDirty,
    isPushing,
    leftNote,
    rightNote,
    leftLeaf,
    rightLeaf,
    leftView,
    rightView,
    focusedPane,
  } from '../../lib/stores'

  // ビューコンポーネント
  import HomeView from '../views/HomeView.svelte'
  import NoteView from '../views/NoteView.svelte'
  import EditorView from '../views/EditorView.svelte'
  import PreviewView from '../views/PreviewView.svelte'

  // フッターコンポーネント
  import HomeFooter from './footer/HomeFooter.svelte'
  import NoteFooter from './footer/NoteFooter.svelte'
  import EditorFooter from './footer/EditorFooter.svelte'
  import PreviewFooter from './footer/PreviewFooter.svelte'

  // その他
  import Breadcrumbs from './Breadcrumbs.svelte'
  import Loading from './Loading.svelte'
  import StatsPanel from './StatsPanel.svelte'

  // Props
  export let pane: Pane
  export let editorViewRef: any = null
  export let previewViewRef: any = null

  // Context から取得
  const actions = getContext<PaneActions>('paneActions')
  const state = getContext<Writable<PaneState>>('paneState')

  // pane に応じてストアを選択
  $: currentView = pane === 'left' ? $leftView : $rightView
  $: currentNote = pane === 'left' ? $leftNote : $rightNote
  // Priority/OfflineリーフはPaneStateの常に最新のものを使う
  $: storeLeaf = pane === 'left' ? $leftLeaf : $rightLeaf
  $: currentLeaf = storeLeaf
    ? isPriorityLeaf(storeLeaf.id)
      ? $state.currentPriorityLeaf
      : isOfflineLeaf(storeLeaf.id)
        ? $state.currentOfflineLeaf
        : storeLeaf
    : null
  $: selectedIndex = pane === 'left' ? $state.selectedIndexLeft : $state.selectedIndexRight
  $: breadcrumbs = pane === 'left' ? $state.breadcrumbs : $state.breadcrumbsRight
  $: isActive = $focusedPane === pane

  // currentWorldに応じてノート・リーフストアを切り替え
  $: isArchiveWorld = $state.currentWorld === 'archive'
  $: activeNotes = isArchiveWorld ? $archiveNotes : $notes
  $: activeLeaves = isArchiveWorld ? $archiveLeaves : $leaves
  $: activeRootNotes = isArchiveWorld
    ? $archiveNotes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)
    : $rootNotes
  $: activeMetadata = isArchiveWorld ? $archiveMetadata : $metadata

  // サブノート・リーフのフィルタリング
  $: subNotes = currentNote
    ? activeNotes.filter((n) => n.parentId === currentNote.id).sort((a, b) => a.order - b.order)
    : []
  $: currentLeaves = currentNote
    ? activeLeaves.filter((l) => l.noteId === currentNote.id).sort((a, b) => a.order - b.order)
    : []

  // スクロールハンドラー
  $: handleScroll = pane === 'left' ? actions.handleLeftScroll : actions.handleRightScroll
</script>

<Breadcrumbs
  {breadcrumbs}
  editingId={$state.editingBreadcrumb}
  onStartEdit={actions.startEditingBreadcrumb}
  onSaveEdit={actions.saveEditBreadcrumb}
  onCancelEdit={actions.cancelEditBreadcrumb}
  onCopyUrl={() => actions.handleCopyUrl(pane)}
  onCopyMarkdown={() => actions.handleCopyMarkdown(pane)}
  onShareImage={() => actions.handleShareImage(pane)}
  onShareSelectionImage={() => actions.handleShareSelectionImage(pane)}
  isPreview={currentView === 'preview'}
  getHasSelection={() => actions.getHasSelection(pane)}
  getSelectedText={() => actions.getSelectedText(pane)}
  getMarkdownContent={currentLeaf
    ? () =>
        isPriorityLeaf(currentLeaf.id)
          ? generatePriorityPlainText($priorityItems)
          : currentLeaf.content
    : null}
  onSelectSibling={(id, type) => actions.selectSiblingFromBreadcrumb(id, type, pane)}
  currentWorld={$state.currentWorld}
  onWorldChange={actions.handleWorldChange}
  isArchiveLoading={$state.isArchiveLoading}
/>

<main class="main-pane">
  {#if currentView === 'home'}
    <HomeView
      notes={activeRootNotes}
      allLeaves={activeLeaves}
      isFirstPriorityFetched={isArchiveWorld || $state.isFirstPriorityFetched}
      isPullCompleted={isArchiveWorld || $state.isPullCompleted}
      {selectedIndex}
      {isActive}
      vimMode={$settings.vimMode ?? false}
      onSelectNote={(note) => actions.selectNote(note, pane)}
      onDragStart={actions.handleDragStartNote}
      onDragEnd={actions.handleDragEndNote}
      onDragOver={actions.handleDragOverNote}
      onDrop={actions.handleDropNote}
      dragOverNoteId={$state.dragOverNoteId}
      onUpdateNoteBadge={actions.updateNoteBadge}
      priorityLeaf={isArchiveWorld ? null : $state.currentPriorityLeaf}
      onSelectPriority={() => actions.openPriorityView(pane)}
      onUpdatePriorityBadge={actions.updatePriorityBadge}
      offlineLeaf={isArchiveWorld ? null : $state.currentOfflineLeaf}
      onSelectOffline={() => actions.openOfflineView(pane)}
      onUpdateOfflineBadge={actions.updateOfflineBadge}
      isArchive={isArchiveWorld}
    />
  {:else if currentView === 'note' && currentNote}
    <NoteView
      {currentNote}
      {subNotes}
      allNotes={activeNotes}
      leaves={currentLeaves}
      allLeaves={activeLeaves}
      isFirstPriorityFetched={isArchiveWorld || $state.isFirstPriorityFetched}
      {selectedIndex}
      {isActive}
      vimMode={$settings.vimMode ?? false}
      onSelectNote={(note) => actions.selectNote(note, pane)}
      onSelectLeaf={(leaf) => actions.selectLeaf(leaf, pane)}
      onDragStartNote={actions.handleDragStartNote}
      onDragStartLeaf={actions.handleDragStartLeaf}
      onDragEndNote={actions.handleDragEndNote}
      onDragEndLeaf={actions.handleDragEndLeaf}
      onDragOverNote={actions.handleDragOverNote}
      onDragOverLeaf={actions.handleDragOverLeaf}
      onDropNote={actions.handleDropNote}
      onDropLeaf={actions.handleDropLeaf}
      dragOverNoteId={$state.dragOverNoteId}
      dragOverLeafId={$state.dragOverLeafId}
      onUpdateNoteBadge={actions.updateNoteBadge}
      onUpdateLeafBadge={actions.updateLeafBadge}
      leafSkeletonMap={$state.leafSkeletonMap}
      onSwipeLeft={() => actions.goToNextSibling(pane)}
      onSwipeRight={() => actions.goToPrevSibling(pane)}
      isArchive={isArchiveWorld}
    />
  {:else if currentView === 'edit' && currentLeaf}
    <EditorView
      bind:this={editorViewRef}
      leaf={currentLeaf}
      theme={$settings.theme}
      vimMode={$settings.vimMode ?? false}
      linedMode={$settings.linedMode ?? false}
      {pane}
      onContentChange={actions.updateLeafContent}
      onPush={actions.handlePushToGitHub}
      onClose={() => actions.closeLeaf(pane)}
      onSwitchPane={() => actions.switchPane(pane)}
      onDownload={(leafId) => actions.downloadLeafAsMarkdown(leafId, pane)}
      onDelete={(leafId) => actions.deleteLeaf(leafId, pane)}
      onScroll={handleScroll}
    />
  {:else if currentView === 'preview' && currentLeaf}
    <PreviewView
      bind:this={previewViewRef}
      leaf={currentLeaf}
      onScroll={handleScroll}
      onPriorityLinkClick={(leafId, line) => actions.handlePriorityLinkClick(leafId, line, pane)}
    />
  {/if}
</main>

{#if currentView === 'home'}
  <StatsPanel
    leafCount={$state.totalLeafCount}
    leafCharCount={$state.totalLeafChars}
    pushCount={$state.lastPulledPushCount}
  />
{/if}

{#if currentView === 'home'}
  <HomeFooter
    onCreateNote={(name) => actions.createNote(undefined, pane, name)}
    onPush={actions.handlePushToGitHub}
    disabled={!$state.isPullCompleted}
    isDirty={$isDirty}
    pushDisabled={!$state.canPush}
    pushDisabledReason={$state.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    currentWorld={$state.currentWorld}
  />
{:else if currentView === 'note' && currentNote}
  <NoteFooter
    onDeleteNote={() => actions.deleteNote(pane)}
    onMove={() => actions.openMoveModalForNote(pane)}
    onCreateSubNote={(name) => actions.createNote(currentNote.id, pane, name)}
    onCreateLeaf={(name) => actions.createLeaf(pane, name)}
    onPush={actions.handlePushToGitHub}
    disabled={!$state.isPullCompleted}
    isDirty={$isDirty}
    canHaveSubNote={!currentNote.parentId}
    pushDisabled={!$state.canPush}
    pushDisabledReason={$state.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    currentWorld={$state.currentWorld}
    onArchive={() => actions.archiveNote(pane)}
    onRestore={() => actions.restoreNote(pane)}
    noteId={currentNote.id}
  />
{:else if currentView === 'edit' && currentLeaf}
  <EditorFooter
    onDelete={() => actions.deleteLeaf(currentLeaf.id, pane)}
    onMove={() => actions.openMoveModalForLeaf(pane)}
    onDownload={() => actions.downloadLeafAsMarkdown(currentLeaf.id, pane)}
    onTogglePreview={() => actions.togglePreview(pane)}
    onPush={actions.handlePushToGitHub}
    disabled={!$state.isPullCompleted && !isOfflineLeaf(currentLeaf.id)}
    isDirty={$isDirty}
    pushDisabled={!$state.canPush}
    pushDisabledReason={$state.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    hideDeleteMove={isOfflineLeaf(currentLeaf.id)}
    getHasSelection={() => actions.getHasSelection(pane)}
    currentWorld={$state.currentWorld}
    onArchive={() => actions.archiveLeaf(pane)}
    onRestore={() => actions.restoreLeaf(pane)}
  />
{:else if currentView === 'preview' && currentLeaf}
  <PreviewFooter
    onMove={() => actions.openMoveModalForLeaf(pane)}
    onDownload={() => actions.downloadLeafAsImage(currentLeaf.id, pane)}
    onToggleEdit={() => actions.togglePreview(pane)}
    onPush={actions.handlePushToGitHub}
    disabled={!$state.isPullCompleted && !isOfflineLeaf(currentLeaf.id)}
    isDirty={$isDirty}
    pushDisabled={!$state.canPush}
    pushDisabledReason={$state.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    hideEditButton={isPriorityLeaf(currentLeaf.id)}
    hideMoveButton={isPriorityLeaf(currentLeaf.id) || isOfflineLeaf(currentLeaf.id)}
    currentWorld={$state.currentWorld}
    onArchive={() => actions.archiveLeaf(pane)}
    onRestore={() => actions.restoreLeaf(pane)}
  />
{/if}

<!-- ガラス効果オーバーレイ（オフラインリーフ表示中は除外 - GitHub同期と無関係なため） -->
{#if ($state.isLoadingUI || $isPushing) && !(currentLeaf && isOfflineLeaf(currentLeaf.id))}
  <Loading />
{/if}
