<script lang="ts">
  import { getContext } from 'svelte'
  import type { Pane } from '../../lib/navigation'
  import type { PaneActions, PaneState } from '../../lib/stores'
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
    isPulling,
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
  import OcrModal from './OcrModal.svelte'
  import { showPushToast } from '../../lib/ui/ui.svelte'
  import { _ } from 'svelte-i18n'

  // Props
  interface Props {
    pane: Pane
    editorViewRef?: any
    previewViewRef?: any
  }

  let { pane, editorViewRef = $bindable(null), previewViewRef = $bindable(null) }: Props = $props()

  // OCR モーダルの状態
  let showOcrModal = $state(false)

  function handleOcr() {
    showOcrModal = true
  }

  function handleOcrComplete(text: string) {
    showOcrModal = false
    if (editorViewRef && editorViewRef.insertAtCursor) {
      editorViewRef.insertAtCursor(text)
    }
    showPushToast($_('ocr.complete'), 'success')
  }

  function handleOcrClose() {
    showOcrModal = false
  }

  // Context から取得
  const actions = getContext<PaneActions>('paneActions')
  const paneState = getContext<{ value: PaneState }>('paneState')

  // pane に応じてストアを選択
  let currentView = $derived(pane === 'left' ? leftView.value : rightView.value)
  let currentNote = $derived(pane === 'left' ? leftNote.value : rightNote.value)
  // Priority/OfflineリーフはPaneStateの常に最新のものを使う
  let storeLeaf = $derived(pane === 'left' ? leftLeaf.value : rightLeaf.value)
  let currentLeaf = $derived(
    storeLeaf
      ? isPriorityLeaf(storeLeaf.id)
        ? paneState.value.currentPriorityLeaf
        : isOfflineLeaf(storeLeaf.id)
          ? paneState.value.currentOfflineLeaf
          : storeLeaf
      : null
  )
  let selectedIndex = $derived(
    pane === 'left' ? paneState.value.selectedIndexLeft : paneState.value.selectedIndexRight
  )
  let breadcrumbs = $derived(
    pane === 'left' ? paneState.value.breadcrumbs : paneState.value.breadcrumbsRight
  )
  let isActive = $derived(focusedPane.value === pane)

  // ペインのワールドに応じてノート・リーフストアを切り替え
  let paneWorld = $derived(pane === 'left' ? paneState.value.leftWorld : paneState.value.rightWorld)
  let isArchiveWorld = $derived(paneWorld === 'archive')
  let activeNotes = $derived(isArchiveWorld ? archiveNotes.value : notes.value)
  let activeLeaves = $derived(isArchiveWorld ? archiveLeaves.value : leaves.value)
  let activeRootNotes = $derived(
    isArchiveWorld
      ? archiveNotes.value.filter((n) => !n.parentId).sort((a, b) => a.order - b.order)
      : rootNotes.value
  )
  let activeMetadata = $derived(isArchiveWorld ? archiveMetadata.value : metadata.value)

  // サブノート・リーフのフィルタリング
  let subNotes = $derived(
    currentNote
      ? activeNotes.filter((n) => n.parentId === currentNote.id).sort((a, b) => a.order - b.order)
      : []
  )
  let currentLeaves = $derived(
    currentNote
      ? activeLeaves.filter((l) => l.noteId === currentNote.id).sort((a, b) => a.order - b.order)
      : []
  )

  // スクロールハンドラー
  let handleScroll = $derived(
    pane === 'left' ? actions.handleLeftScroll : actions.handleRightScroll
  )
</script>

<Breadcrumbs
  {breadcrumbs}
  editingId={paneState.value.editingBreadcrumb}
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
          ? generatePriorityPlainText(priorityItems.value)
          : currentLeaf.content
    : null}
  onSelectSibling={(id, type) => actions.selectSiblingFromBreadcrumb(id, type, pane)}
  currentWorld={paneWorld}
  onWorldChange={(world) => actions.handleWorldChange(world, pane)}
  isArchiveLoading={paneState.value.isArchiveLoading}
  isSyncing={isPulling.value || isPushing.value}
/>

<main class="main-pane">
  {#if currentView === 'home'}
    <HomeView
      notes={activeRootNotes}
      allLeaves={activeLeaves}
      isFirstPriorityFetched={isArchiveWorld || paneState.value.isFirstPriorityFetched}
      isPullCompleted={isArchiveWorld || paneState.value.isPullCompleted}
      {selectedIndex}
      {isActive}
      vimMode={settings.value.vimMode ?? false}
      onSelectNote={(note) => actions.selectNote(note, pane)}
      onDragStart={actions.handleDragStartNote}
      onDragEnd={actions.handleDragEndNote}
      onDragOver={actions.handleDragOverNote}
      onDrop={actions.handleDropNote}
      dragOverNoteId={paneState.value.dragOverNoteId}
      onUpdateNoteBadge={(noteId, icon, color) =>
        actions.updateNoteBadge(noteId, icon, color, pane)}
      priorityLeaf={isArchiveWorld ? null : paneState.value.currentPriorityLeaf}
      onSelectPriority={() => actions.openPriorityView(pane)}
      onUpdatePriorityBadge={actions.updatePriorityBadge}
      offlineLeaf={isArchiveWorld ? null : paneState.value.currentOfflineLeaf}
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
      isFirstPriorityFetched={isArchiveWorld || paneState.value.isFirstPriorityFetched}
      {selectedIndex}
      {isActive}
      vimMode={settings.value.vimMode ?? false}
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
      dragOverNoteId={paneState.value.dragOverNoteId}
      dragOverLeafId={paneState.value.dragOverLeafId}
      onUpdateNoteBadge={(noteId, icon, color) =>
        actions.updateNoteBadge(noteId, icon, color, pane)}
      onUpdateLeafBadge={(leafId, icon, color) =>
        actions.updateLeafBadge(leafId, icon, color, pane)}
      leafSkeletonMap={paneState.value.leafSkeletonMap}
      onSwipeLeft={() => actions.goToNextSibling(pane)}
      onSwipeRight={() => actions.goToPrevSibling(pane)}
      isArchive={isArchiveWorld}
    />
  {:else if currentView === 'edit' && currentLeaf}
    <EditorView
      bind:this={editorViewRef}
      leaf={currentLeaf}
      theme={settings.value.theme}
      vimMode={settings.value.vimMode ?? false}
      linedMode={settings.value.linedMode ?? false}
      cursorTrailEnabled={settings.value.cursorTrailEnabled ?? false}
      {pane}
      onContentChange={(content, leafId) => actions.updateLeafContent(content, leafId, pane)}
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
    leafCount={paneState.value.totalLeafCount}
    leafCharCount={paneState.value.totalLeafChars}
    pushCount={paneState.value.lastPulledPushCount}
  />
{/if}

{#if currentView === 'home'}
  <HomeFooter
    onCreateNote={(name) => actions.createNote(undefined, pane, name)}
    onPush={actions.handlePushToGitHub}
    disabled={!paneState.value.isPullCompleted}
    isDirty={isDirty.value}
    pushDisabled={!paneState.value.canPush}
    pushDisabledReason={paneState.value.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    currentWorld={paneWorld}
  />
{:else if currentView === 'note' && currentNote}
  <NoteFooter
    onDeleteNote={() => actions.deleteNote(pane)}
    onMove={() => actions.openMoveModalForNote(pane)}
    onCreateSubNote={(name) => actions.createNote(currentNote.id, pane, name)}
    onCreateLeaf={(name) => actions.createLeaf(pane, name)}
    onPush={actions.handlePushToGitHub}
    disabled={!paneState.value.isPullCompleted}
    isDirty={isDirty.value}
    canHaveSubNote={!currentNote.parentId}
    pushDisabled={!paneState.value.canPush}
    pushDisabledReason={paneState.value.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    currentWorld={paneWorld}
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
    disabled={!paneState.value.isPullCompleted && !isOfflineLeaf(currentLeaf.id)}
    isDirty={isDirty.value}
    pushDisabled={!paneState.value.canPush}
    pushDisabledReason={paneState.value.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    hideDeleteMove={isOfflineLeaf(currentLeaf.id)}
    getHasSelection={() => actions.getHasSelection(pane)}
    currentWorld={paneWorld}
    onArchive={() => actions.archiveLeaf(pane)}
    onRestore={() => actions.restoreLeaf(pane)}
    onOcr={handleOcr}
  />
{:else if currentView === 'preview' && currentLeaf}
  <PreviewFooter
    onMove={() => actions.openMoveModalForLeaf(pane)}
    onDownload={() => actions.downloadLeafAsImage(currentLeaf.id, pane)}
    onToggleEdit={() => actions.togglePreview(pane)}
    onPush={actions.handlePushToGitHub}
    disabled={!paneState.value.isPullCompleted && !isOfflineLeaf(currentLeaf.id)}
    isDirty={isDirty.value}
    pushDisabled={!paneState.value.canPush}
    pushDisabledReason={paneState.value.pushDisabledReason}
    onDisabledPushClick={actions.handleDisabledPushClick}
    hideEditButton={isPriorityLeaf(currentLeaf.id)}
    hideMoveButton={isPriorityLeaf(currentLeaf.id) || isOfflineLeaf(currentLeaf.id)}
    currentWorld={paneWorld}
    onArchive={() => actions.archiveLeaf(pane)}
    onRestore={() => actions.restoreLeaf(pane)}
  />
{/if}

<!-- ガラス効果オーバーレイ（オフラインリーフ表示中は除外 - GitHub同期と無関係なため） -->
{#if (paneState.value.isLoadingUI || isPushing.value) && !(currentLeaf && isOfflineLeaf(currentLeaf.id))}
  <Loading />
{/if}

<!-- OCRモーダル -->
<OcrModal show={showOcrModal} {pane} onComplete={handleOcrComplete} onClose={handleOcrClose} />
