<script lang="ts">
  import { getContext } from 'svelte'
  import type { Writable } from 'svelte/store'
  import type { Pane } from '../../lib/navigation'
  import type { PaneActions, PaneState, PANE_ACTIONS_KEY, PANE_STATE_KEY } from '../../lib/stores'
  import type { Note, Leaf, View } from '../../lib/types'

  // ストア
  import {
    settings,
    notes,
    leaves,
    rootNotes,
    metadata,
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
  $: currentLeaf = pane === 'left' ? $leftLeaf : $rightLeaf
  $: selectedIndex = pane === 'left' ? $state.selectedIndexLeft : $state.selectedIndexRight
  $: breadcrumbs = pane === 'left' ? $state.breadcrumbs : $state.breadcrumbsRight
  $: isActive = $focusedPane === pane

  // サブノート・リーフのフィルタリング
  $: subNotes = currentNote
    ? $notes.filter((n) => n.parentId === currentNote.id).sort((a, b) => a.order - b.order)
    : []
  $: currentLeaves = currentNote
    ? $leaves.filter((l) => l.noteId === currentNote.id).sort((a, b) => a.order - b.order)
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
  isPreview={currentView === 'preview'}
  onSelectSibling={(id, type) => actions.selectSiblingFromBreadcrumb(id, type, pane)}
/>

<main class="main-pane">
  {#if currentView === 'home'}
    <HomeView
      notes={$rootNotes}
      allLeaves={$leaves}
      disabled={$state.isOperationsLocked}
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
      priorityLeaf={$state.currentPriorityLeaf}
      onSelectPriority={() => actions.openPriorityView(pane)}
      onUpdatePriorityBadge={actions.updatePriorityBadge}
    />
  {:else if currentView === 'note' && currentNote}
    <NoteView
      {currentNote}
      {subNotes}
      allNotes={$notes}
      leaves={currentLeaves}
      allLeaves={$leaves}
      disabled={$state.isOperationsLocked}
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
      onSave={actions.handleSaveToGitHub}
      onClose={() => actions.closeLeaf(pane)}
      onSwitchPane={() => actions.switchPane(pane)}
      onDownload={actions.downloadLeafAsMarkdown}
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
    pushCount={$metadata.pushCount}
  />
{/if}

{#if currentView === 'home'}
  <HomeFooter
    onCreateNote={() => actions.createNote(undefined, pane)}
    onSave={actions.handleSaveToGitHub}
    disabled={$state.isOperationsLocked}
    isDirty={$isDirty}
    saveDisabled={!$state.canPush}
    saveDisabledReason={$state.saveDisabledReason}
    onDisabledSaveClick={actions.handleDisabledSaveClick}
  />
{:else if currentView === 'note' && currentNote}
  <NoteFooter
    onDeleteNote={() => actions.deleteNote(pane)}
    onMove={() => actions.openMoveModalForNote(pane)}
    onCreateSubNote={() => actions.createNote(currentNote.id, pane)}
    onCreateLeaf={() => actions.createLeaf(pane)}
    onSave={actions.handleSaveToGitHub}
    disabled={$state.isOperationsLocked}
    isDirty={$isDirty}
    canHaveSubNote={!currentNote.parentId}
    saveDisabled={!$state.canPush}
    saveDisabledReason={$state.saveDisabledReason}
    onDisabledSaveClick={actions.handleDisabledSaveClick}
  />
{:else if currentView === 'edit' && currentLeaf}
  <EditorFooter
    onDelete={() => actions.deleteLeaf(currentLeaf.id, pane)}
    onMove={() => actions.openMoveModalForLeaf(pane)}
    onDownload={() => actions.downloadLeafAsMarkdown(currentLeaf.id)}
    onTogglePreview={() => actions.togglePreview(pane)}
    onSave={actions.handleSaveToGitHub}
    disabled={$state.isOperationsLocked}
    isDirty={$isDirty}
    saveDisabled={!$state.canPush}
    saveDisabledReason={$state.saveDisabledReason}
    onDisabledSaveClick={actions.handleDisabledSaveClick}
  />
{:else if currentView === 'preview' && currentLeaf}
  <PreviewFooter
    onMove={() => actions.openMoveModalForLeaf(pane)}
    onDownload={() => actions.downloadLeafAsImage(currentLeaf.id, pane)}
    onToggleEdit={() => actions.togglePreview(pane)}
    onSave={actions.handleSaveToGitHub}
    disabled={$state.isOperationsLocked}
    isDirty={$isDirty}
    saveDisabled={!$state.canPush}
    saveDisabledReason={$state.saveDisabledReason}
    onDisabledSaveClick={actions.handleDisabledSaveClick}
  />
{/if}

{#if $state.isOperationsLocked && !$state.showWelcome && !$state.isLoadingUI}
  <div class="config-required-overlay"></div>
{/if}
{#if $state.isLoadingUI || $isPushing}
  <Loading />
{/if}
