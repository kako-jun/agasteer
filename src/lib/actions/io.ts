import { get } from 'svelte/store' // for svelte-i18n only
import type { Note, Leaf, Metadata } from '../types'
import type { Pane } from '../navigation'
import { showPushToast, choiceAsync, alertAsync } from '../ui'
import {
  settings,
  notes,
  leaves,
  metadata,
  archiveNotes,
  archiveLeaves,
  archiveMetadata,
  updateArchiveNotes,
  updateArchiveLeaves,
  updateNotes,
  updateLeaves,
  isArchiveLoaded,
} from '../stores'
import {
  processImportFile,
  applyImportedAttachments,
  isAgasteerZip,
  parseAgasteerZip,
} from '../data'
import { uploadMedia, isMediaConfigured } from '../api'
import { optimizeImageFile } from '../utils/image-optimize'
import { buildNotesZip, generateUniqueName } from '../utils'
import { appState, appActions, getLeavesForPane } from '../app-state.svelte'
import { _ } from '../i18n'

/**
 * Git clone相当のZIPエクスポート
 */
export async function exportNotesAsZip(): Promise<void> {
  const $_ = get(_)

  if (!appState.isFirstPriorityFetched) {
    showPushToast($_('settings.importExport.needInitialPull'), 'error')
    return
  }
  if (appState.isExportingZip) return

  appState.isExportingZip = true
  try {
    const allNotes = notes.value
    const allLeaves = leaves.value
    const currentMetadata = metadata.value as Metadata

    const result = await buildNotesZip(allNotes, allLeaves, currentMetadata, {
      gitPolicyLine: $_('settings.importExport.gitPolicy'),
      infoFooterLine: $_('settings.importExport.infoFileFooter'),
    })

    if (!result.success || !result.blob) {
      if (result.reason === 'empty') {
        showPushToast($_('settings.importExport.nothingToExport'), 'error')
      } else {
        console.error('ZIP export failed:', result.error)
        showPushToast($_('settings.importExport.exportFailed'), 'error')
      }
      return
    }

    const url = URL.createObjectURL(result.blob)
    const $settings = settings.value
    const safeName =
      ($settings.toolName || 'notes')
        .replace(/[^a-z0-9_-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'notes'
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}-export.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showPushToast($_('settings.importExport.exportSuccess'), 'success')
  } catch (error) {
    console.error('ZIP export failed:', error)
    showPushToast($_('settings.importExport.exportFailed'), 'error')
  } finally {
    appState.isExportingZip = false
  }
}

/**
 * 他アプリからのインポート
 */
export async function handleImportFromOtherApps(): Promise<void> {
  const $_ = get(_)

  if (appState.isImporting) return
  if (!appState.isFirstPriorityFetched) {
    showPushToast($_('settings.importExport.needInitialPullImport'), 'error')
    return
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.zip,.txt'
  input.multiple = false

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    appState.isImporting = true
    try {
      showPushToast($_('settings.importExport.importStarting'), 'success')

      // まずAgasteer形式かどうかをチェック
      if (file.name.toLowerCase().endsWith('.zip') && (await isAgasteerZip(file))) {
        await handleAgasteerImport(file)
        return
      }

      // SimpleNote形式などの他のインポート
      const allNotes = notes.value
      const allLeaves = leaves.value

      // まずファイルをパースして重複チェック
      const result = await processImportFile(file, {
        existingNotesCount: allNotes.length ? Math.max(...allNotes.map((n) => n.order)) + 1 : 0,
        existingLeavesMaxOrder: allLeaves.length ? Math.max(...allLeaves.map((l) => l.order)) : -1,
        translate: $_,
      })

      if (!result.success) {
        showPushToast($_('settings.importExport.unsupportedFile'), 'error')
        return
      }

      const { newNote, reportLeaf, importedLeaves, errors } = result.result

      // 同名のノートが存在するかチェック
      const existingNote = allNotes.find((n) => n.name === newNote.name)
      let dialogChoice: 'add' | null = null
      if (existingNote) {
        // 重複がある場合は確認ダイアログを表示
        const choice = await choiceAsync($_('modal.duplicateChoiceMessage'), [
          { label: $_('modal.duplicateChoiceAdd'), value: 'add', variant: 'primary' },
          { label: $_('modal.duplicateChoiceSkip'), value: 'skip', variant: 'secondary' },
          { label: $_('common.cancel'), value: 'cancel', variant: 'cancel' },
        ])

        if (choice === 'cancel' || choice === null) {
          return
        }
        if (choice === 'skip') {
          showPushToast($_('settings.importExport.importSkipped'), 'success')
          return
        }
        dialogChoice = 'add'
      }

      // #249: 添付のアップロードと記法追記は「取り込みが確定した」この時点で行う。
      // ダイアログの cancel / skip より前にアップロードすると、参照されない
      // 孤児メディアがリポに残るため。uploadMedia は enqueue で URL 即確定
      //（await はローカル処理のみ・オフラインでも成立。実アップロードは背景
      // 直列チェーン + online 復帰リトライ）。画像の自動最適化は添付 UX と同じ
      // 設定（mediaOptimizeImages 既定 ON）に従い、URL・ファイル名は最適化後の
      // 内容で確定する。メディア未設定なら uploader を渡さず、レポートに
      // unsupported として記録される
      await applyImportedAttachments(
        result.result,
        $_,
        isMediaConfigured(settings.value)
          ? async (attachmentFile) => {
              const optimize = settings.value.mediaOptimizeImages ?? true
              const uploadFile = optimize ? await optimizeImageFile(attachmentFile) : attachmentFile
              const uploaded = await uploadMedia(uploadFile, settings.value)
              return 'errorKind' in uploaded
                ? { ok: false, errorKind: uploaded.errorKind }
                : { ok: true, url: uploaded.url, name: uploadFile.name }
            }
          : undefined
      )

      if (dialogChoice === 'add' && existingNote) {
        // choice === 'add': 既存ノートにリーフを追加
        const existingLeafTitles = allLeaves
          .filter((l) => l.noteId === existingNote.id)
          .map((l) => l.title)

        // レポートリーフと各インポートリーフのnoteIdを既存ノートに変更、重複はリネーム
        const mergedReportLeaf = {
          ...reportLeaf,
          noteId: existingNote.id,
          title: existingLeafTitles.includes(reportLeaf.title)
            ? generateUniqueName(reportLeaf.title, existingLeafTitles)
            : reportLeaf.title,
        }

        const updatedExistingTitles = [...existingLeafTitles, mergedReportLeaf.title]
        const mergedLeaves = importedLeaves.map((l) => {
          if (updatedExistingTitles.includes(l.title)) {
            const newTitle = generateUniqueName(l.title, updatedExistingTitles)
            updatedExistingTitles.push(newTitle)
            return { ...l, noteId: existingNote.id, title: newTitle }
          }
          updatedExistingTitles.push(l.title)
          return { ...l, noteId: existingNote.id }
        })

        // 既存ノートにリーフを追加（ノート自体は作成しない）
        updateLeaves([...allLeaves, mergedReportLeaf, ...mergedLeaves])
      } else {
        // 重複なし：新規ノートを作成
        updateNotes([...allNotes, newNote])
        updateLeaves([...allLeaves, reportLeaf, ...importedLeaves])
      }

      if (errors?.length) console.warn('Import skipped items:', errors)
      appState.importOccurredInSettings = true
      showPushToast($_('settings.importExport.importDone'), 'success')
    } catch (error) {
      console.error('Import failed:', error)
      showPushToast($_('settings.importExport.importFailed'), 'error')
    } finally {
      appState.isImporting = false
    }
  }

  input.click()
}

/**
 * Agasteer形式のzipをインポート（既存データを完全に置き換え）
 */
export async function handleAgasteerImport(file: File): Promise<void> {
  const $_ = get(_)

  try {
    const result = await parseAgasteerZip(file)
    if (!result) {
      showPushToast($_('settings.importExport.unsupportedFile'), 'error')
      return
    }

    // 既存データを完全に置き換え
    updateNotes(result.notes)
    updateLeaves(result.leaves)
    metadata.value = result.metadata

    // アーカイブデータがあればストアに設定
    if (result.archiveNotes.length > 0 || result.archiveLeaves.length > 0) {
      updateArchiveNotes(result.archiveNotes)
      updateArchiveLeaves(result.archiveLeaves)
      if (result.archiveMetadata) {
        archiveMetadata.value = result.archiveMetadata
      }
      isArchiveLoaded.value = true
    }

    appState.importOccurredInSettings = true
    showPushToast($_('settings.importExport.importDone'), 'success')
  } catch (error) {
    console.error('Agasteer import failed:', error)
    showPushToast($_('settings.importExport.importFailed'), 'error')
  } finally {
    appState.isImporting = false
  }
}

/**
 * Markdownダウンロード（選択範囲があれば選択範囲をダウンロード）
 */
export function downloadLeafAsMarkdown(leafId: string, pane: Pane): void {
  const $_ = get(_)

  if (!appState.isFirstPriorityFetched) {
    showPushToast($_('toast.needInitialPullDownload'), 'error')
    return
  }

  // ペインのワールドに応じたリーフを取得
  const paneLeaves = getLeavesForPane(pane)

  // 選択テキストがあればそれをダウンロード
  const editorView = appActions.getEditorView(pane)
  if (editorView && editorView.getSelectedText) {
    const selectedText = editorView.getSelectedText()
    if (selectedText) {
      const targetLeaf = paneLeaves.find((l) => l.id === leafId)
      if (!targetLeaf) return
      const blob = new Blob([selectedText], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${targetLeaf.title}-selection.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
  }

  // 選択なしの場合は全文ダウンロード
  const targetLeaf = paneLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return
  const blob = new Blob([targetLeaf.content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${targetLeaf.title}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * プレビューを画像としてダウンロード
 */
export async function downloadLeafAsImage(leafId: string, pane: Pane): Promise<void> {
  const $_ = get(_)

  if (!appState.isFirstPriorityFetched) {
    showPushToast($_('toast.needInitialPullDownload'), 'error')
    return
  }

  // ペインのワールドに応じたリーフを取得
  const paneLeaves = getLeavesForPane(pane)
  const targetLeaf = paneLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  try {
    const previewView = appActions.getPreviewView(pane)
    if (previewView && previewView.captureAsImage) {
      await previewView.captureAsImage(targetLeaf.title)
      showPushToast($_('toast.imageDownloaded'), 'success')
    }
  } catch (error) {
    console.error('Failed to download image:', error)
    showPushToast($_('toast.imageDownloadFailed'), 'error')
  }
}
