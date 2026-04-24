<script lang="ts">
  import './App.css'
  import { onMount, setContext } from 'svelte'
  import LeafSpinner from './components/icons/LeafSpinner.svelte'

  import {
    settings,
    leftNote,
    rightNote,
    leftLeaf,
    rightLeaf,
    leftView,
    rightView,
    leftWorld,
    rightWorld,
    isStale,
    lastPulledPushCount,
    pullProgressInfo,
  } from './lib/stores'
  import { _ } from './lib/i18n'

  import {
    pushToastState,
    pullToastState,
    modalState,
    showPullToast,
    closeModal,
    getBreadcrumbs as buildBreadcrumbs,
  } from './lib/ui'
  import { toggleSearch } from './lib/utils'

  import Header from './components/layout/Header.svelte'
  import Modal from './components/layout/Modal.svelte'
  import Toast from './components/layout/Toast.svelte'
  import MoveModal from './components/layout/MoveModal.svelte'
  import SearchBar from './components/layout/SearchBar.svelte'
  import SettingsModal from './components/layout/SettingsModal.svelte'
  import WelcomeModal from './components/layout/WelcomeModal.svelte'
  import InstallBanner from './components/layout/InstallBanner.svelte'
  import PaneView from './components/layout/PaneView.svelte'

  import { paneStateStore, appState, derivedState, initApp } from './lib/app-state.svelte'

  import {
    goHome,
    selectNote,
    updateUrlFromState,
    restoreStateFromUrl,
    openUserGuide,
    handleSearchResultClick,
    swapPanes,
    copyLeftToRight,
    copyRightToLeft,
  } from './lib/pane-navigation.svelte'

  import { handleGlobalKeyDown } from './lib/keyboard-nav.svelte'

  import {
    setupAppActionsAndContext,
    handleThemeChange,
    handleSettingsChange,
    handleTestConnection,
    exportNotesAsZip,
    handleImportFromOtherApps,
    pullFromGitHub,
    pushToGitHub,
    handleMoveConfirm,
    closeMoveModal,
    handleInstall,
    dismissInstallBanner,
    goSettings,
    closeSettings,
    closeWelcome,
    openSettingsFromWelcome,
    setupHmr,
  } from './lib/pane-actions-factory.svelte'

  // ========================================
  // $derived using $_ (must stay in .svelte)
  // ========================================
  let pushDisabledReason = $derived(
    derivedState.pullProgressData
      ? $_('home.leafFetched', {
          values: {
            fetched: derivedState.pullProgressData.fetched,
            total: derivedState.pullProgressData.total,
          },
        })
      : ''
  )

  // ========================================
  // $effect blocks
  // ========================================
  $effect(() => {
    appState.breadcrumbs = buildBreadcrumbs(
      leftView.value,
      leftNote.value,
      leftLeaf.value,
      derivedState.leftBreadcrumbNotes,
      'left',
      goHome,
      selectNote,
      derivedState.leftBreadcrumbLeaves
    )
  })
  $effect(() => {
    appState.breadcrumbsRight = buildBreadcrumbs(
      rightView.value,
      rightNote.value,
      rightLeaf.value,
      derivedState.rightBreadcrumbNotes,
      'right',
      goHome,
      selectNote,
      derivedState.rightBreadcrumbLeaves
    )
  })
  $effect(() => {
    document.title = settings.value.toolName
  })

  // paneState をリアクティブに更新
  $effect(() => {
    paneStateStore.value = {
      isFirstPriorityFetched: appState.isFirstPriorityFetched,
      isPullCompleted: appState.isPullCompleted,
      canPush: derivedState.canPush,
      pushDisabledReason,
      selectedIndexLeft: appState.selectedIndexLeft,
      selectedIndexRight: appState.selectedIndexRight,
      editingBreadcrumb: appState.editingBreadcrumb,
      dragOverNoteId: derivedState.dragOverNoteId,
      dragOverLeafId: derivedState.dragOverLeafId,
      loadingLeafIds: appState.loadingLeafIds,
      leafSkeletonMap: appState.leafSkeletonMap,
      totalLeafCount: derivedState.totalLeafCount,
      totalLeafChars: derivedState.totalLeafChars,
      lastPulledPushCount: lastPulledPushCount.value,
      currentPriorityLeaf: derivedState.currentPriorityLeaf,
      currentOfflineLeaf: derivedState.currentOfflineLeaf,
      breadcrumbs: appState.breadcrumbs,
      breadcrumbsRight: appState.breadcrumbsRight,
      showWelcome: appState.showWelcome,
      isLoadingUI: appState.isLoadingUI,
      leftWorld: leftWorld.value,
      rightWorld: rightWorld.value,
      isArchiveLoading: appState.isArchiveLoading,
    }
  })

  // ペインの状態変更をURLに反映
  $effect(() => {
    leftNote.value
    leftLeaf.value
    leftView.value
    leftWorld.value
    rightNote.value
    rightLeaf.value
    rightView.value
    rightWorld.value
    updateUrlFromState()
  })

  // ========================================
  // Context API
  // ========================================
  setContext('paneState', paneStateStore)

  const paneActions = setupAppActionsAndContext(() => pushDisabledReason)
  setContext('paneActions', paneActions)

  // ========================================
  // onMount
  // ========================================
  onMount(() => {
    return initApp({
      pullFromGitHub,
      pushToGitHub,
      restoreStateFromUrl,
      handleGlobalKeyDown,
    })
  })

  // ========================================
  // HMR
  // ========================================
  setupHmr()
</script>

{#if !appState.i18nReady}
  <!-- i18n読み込み中 -->
  <div class="i18n-loading">
    <LeafSpinner size={40} />
  </div>
{:else}
  <!-- メインアプリケーション -->
  <div class="app-container">
    <Header
      githubConfigured={derivedState.isGitHubConfigured}
      title={settings.value.toolName}
      onTitleClick={() => {
        leftWorld.value = 'home'
        rightWorld.value = 'home'
        goHome('left')
        goHome('right')
      }}
      onSettingsClick={() => {
        goSettings()
      }}
      onPull={() => pullFromGitHub(false)}
      pullDisabled={!derivedState.canPull}
      isStale={isStale.value}
      pullProgress={pullProgressInfo.value}
      onPullProgressClick={() => {
        if (pullProgressInfo.value) {
          showPullToast(
            $_('home.leafFetched', {
              values: {
                fetched: pullProgressInfo.value.fetched,
                total: pullProgressInfo.value.total,
              },
            })
          )
        }
      }}
      onSearchClick={toggleSearch}
      onHelpClick={openUserGuide}
      isDualPane={appState.isDualPane}
      isOperationsLocked={!appState.isFirstPriorityFetched}
      onSwapPanes={swapPanes}
      onCopyLeftToRight={copyLeftToRight}
      onCopyRightToLeft={copyRightToLeft}
    />
    <!-- 検索ドロップダウン（ヘッダー右上、検索ボタンの下） -->
    <SearchBar onResultClick={handleSearchResultClick} isDualPane={appState.isDualPane} />

    <div class="content-wrapper" class:single-pane={!appState.isDualPane}>
      <div class="pane-divider" class:hidden={!appState.isDualPane}></div>
      <div class="left-column">
        <PaneView
          pane="left"
          bind:editorViewRef={appState.leftEditorView}
          bind:previewViewRef={appState.leftPreviewView}
        />
      </div>

      <div class="right-column" class:hidden={!appState.isDualPane}>
        <PaneView
          pane="right"
          bind:editorViewRef={appState.rightEditorView}
          bind:previewViewRef={appState.rightPreviewView}
        />
      </div>
    </div>

    <MoveModal
      show={derivedState.moveModalOpen}
      notes={derivedState.moveTargetNotes}
      targetNote={derivedState.moveTargetNote}
      targetLeaf={derivedState.moveTargetLeaf}
      pane={derivedState.moveTargetPane}
      currentWorld={derivedState.moveTargetWorld}
      onConfirm={handleMoveConfirm}
      onClose={closeMoveModal}
    />

    <Modal
      show={modalState.value.show}
      message={modalState.value.message}
      type={modalState.value.type}
      position={modalState.value.position}
      onConfirm={modalState.value.callback}
      onCancel={modalState.value.cancelCallback}
      onPromptSubmit={modalState.value.promptCallback}
      onChoiceSelect={modalState.value.choiceCallback}
      choiceOptions={modalState.value.choiceOptions || []}
      placeholder={modalState.value.placeholder || ''}
      onClose={closeModal}
    />

    <SettingsModal
      show={appState.showSettings}
      settings={settings.value}
      isTesting={appState.isTesting}
      exporting={appState.isExportingZip}
      importing={appState.isImporting}
      onThemeChange={handleThemeChange}
      onSettingsChange={handleSettingsChange}
      onTestConnection={handleTestConnection}
      onExportZip={exportNotesAsZip}
      onImport={handleImportFromOtherApps}
      onClose={closeSettings}
    />

    <WelcomeModal
      show={appState.showWelcome}
      onOpenSettings={openSettingsFromWelcome}
      onClose={closeWelcome}
    />

    <Toast
      pullMessage={pullToastState.value.message}
      pullVariant={pullToastState.value.variant}
      pushMessage={pushToastState.value.message}
      pushVariant={pushToastState.value.variant}
    />

    {#if appState.showInstallBanner}
      <InstallBanner onInstall={handleInstall} onDismiss={dismissInstallBanner} />
    {/if}
  </div>
{/if}
