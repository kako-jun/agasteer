<script lang="ts">
  /**
   * メディアライブラリ画面（#250・初版: 一覧＋削除のみ）
   *
   * View='media' としてペインにフルスクリーン表示する（settings と同じフルスクリーン流儀）。
   * ワールド（Home/Archive）とは独立し、note/leaf/push の契約は持たない。
   *
   * - マウント時に listMediaAssets で一覧取得（loading/空/エラー再試行を表示）
   * - 画像は resolveMedia→Blob URL でサムネイル（表示領域に入ったものだけ遅延解決）
   * - 動画/音声/zip は拡張子ラベルのプレースホルダ
   * - 削除は確認ダイアログ（参照中ノートが壊れる旨を警告）→ deleteMediaAsset
   * - Blob URL は画面破棄時にすべて revoke（リーク防止）
   */
  import { onMount, onDestroy } from 'svelte'
  import { _ } from '../../lib/i18n'
  import type { Settings } from '../../lib/types'
  import { listMediaAssets, deleteMediaAsset, type MediaAsset } from '../../lib/api/media-library'
  import { resolveMedia } from '../../lib/api/media'
  import { formatMediaSize } from '../../lib/api/media/library'
  import { getMediaExtension } from '../../lib/api/media/naming'
  import { classifyPreviewMediaKind, previewMediaMimeType } from '../../lib/preview/media-resolve'
  import { confirmAsync, showPushToast } from '../../lib/ui'
  import LeafSpinner from '../icons/LeafSpinner.svelte'
  import ArrowLeftIcon from '../icons/ArrowLeftIcon.svelte'
  import DeleteIcon from '../icons/DeleteIcon.svelte'

  interface Props {
    settings: Settings
    /** ホーム画面へ戻る（View を home に戻す） */
    onClose: () => void
  }

  let { settings, onClose }: Props = $props()

  type LoadState = 'loading' | 'loaded' | 'error'
  let loadState = $state<LoadState>('loading')
  let assets = $state<MediaAsset[]>([])
  let errorKind = $state<string | null>(null)
  /** 削除中のアセット path（ボタン二度押し防止） */
  let deletingPath = $state<string | null>(null)
  /** rawUrl → サムネイルの Blob URL（解決済みのみ） */
  let thumbUrls = $state<Record<string, string>>({})

  // 解決の重複防止・遅延解決の観測。$state 外（描画に不要）
  const resolving = new Set<string>()
  const elToAsset = new Map<Element, MediaAsset>()
  let observer: IntersectionObserver | null = null
  let disposed = false

  let errorMessage = $derived(
    errorKind === 'not_configured'
      ? $_('media.errors.not_configured')
      : $_('media.library.loadFailed')
  )

  function kindOf(asset: MediaAsset): 'image' | 'video' | 'audio' | 'download' {
    return classifyPreviewMediaKind(asset.rawUrl) ?? 'download'
  }

  function extLabel(asset: MediaAsset): string {
    return getMediaExtension(asset.name).toUpperCase() || 'FILE'
  }

  async function load() {
    loadState = 'loading'
    errorKind = null
    const result = await listMediaAssets(settings)
    if (disposed) return
    // strict でない tsconfig では !result.ok の真偽値 narrowing が効かないため in 演算子で判別
    if ('errorKind' in result) {
      errorKind = result.errorKind
      loadState = 'error'
      return
    }
    assets = result.assets
    loadState = 'loaded'
  }

  /** 表示領域に入った画像アセットを 1 回だけ解決して Blob URL を作る */
  async function resolveThumb(asset: MediaAsset) {
    if (thumbUrls[asset.rawUrl] || resolving.has(asset.rawUrl)) return
    resolving.add(asset.rawUrl)
    const result = await resolveMedia(asset.rawUrl, settings)
    resolving.delete(asset.rawUrl)
    if (disposed || !result.ok) return
    const blobUrl = URL.createObjectURL(
      new Blob([result.data], { type: previewMediaMimeType(asset.name) })
    )
    if (disposed) {
      URL.revokeObjectURL(blobUrl)
      return
    }
    thumbUrls = { ...thumbUrls, [asset.rawUrl]: blobUrl }
  }

  /** 画像サムネイルのプレースホルダに付ける action。可視化されたら解決を蹴る */
  function thumbObserve(node: HTMLElement, asset: MediaAsset) {
    elToAsset.set(node, asset)
    observer?.observe(node)
    return {
      destroy() {
        observer?.unobserve(node)
        elToAsset.delete(node)
      },
    }
  }

  async function handleDelete(asset: MediaAsset) {
    const confirmed = await confirmAsync(
      $_('media.library.deleteConfirm', { values: { name: asset.name } })
    )
    if (!confirmed || disposed) return
    deletingPath = asset.path
    const result = await deleteMediaAsset(settings, asset.path, asset.sha)
    if (disposed) return
    deletingPath = null
    if (result.ok) {
      const blobUrl = thumbUrls[asset.rawUrl]
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        const { [asset.rawUrl]: _omit, ...rest } = thumbUrls
        thumbUrls = rest
      }
      assets = assets.filter((a) => a.path !== asset.path)
      showPushToast($_('media.library.deleted', { values: { name: asset.name } }), 'success')
    } else {
      showPushToast($_('media.library.deleteFailed'), 'error')
    }
  }

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const asset = elToAsset.get(entry.target)
          if (asset) void resolveThumb(asset)
          observer?.unobserve(entry.target)
        }
      },
      { rootMargin: '150px' }
    )
    void load()
  })

  onDestroy(() => {
    disposed = true
    observer?.disconnect()
    observer = null
    for (const blobUrl of Object.values(thumbUrls)) {
      URL.revokeObjectURL(blobUrl)
    }
    thumbUrls = {}
  })
</script>

<section class="media-library">
  <div class="media-header">
    <button class="back-button" onclick={onClose} aria-label={$_('media.library.back')}>
      <ArrowLeftIcon />
    </button>
    <h2>{$_('media.library.title')}</h2>
  </div>

  {#if loadState === 'loading'}
    <div class="media-status">
      <LeafSpinner size={32} />
      <span>{$_('media.library.loading')}</span>
    </div>
  {:else if loadState === 'error'}
    <div class="media-status">
      <p>{errorMessage}</p>
      <button class="retry-button" onclick={load}>{$_('media.library.retry')}</button>
    </div>
  {:else if assets.length === 0}
    <div class="media-status media-empty">{$_('media.library.empty')}</div>
  {:else}
    <div class="media-grid">
      {#each assets as asset (asset.path)}
        <div class="media-card">
          <div class="media-thumb">
            {#if kindOf(asset) === 'image' && thumbUrls[asset.rawUrl]}
              <img src={thumbUrls[asset.rawUrl]} alt={asset.name} />
            {:else if kindOf(asset) === 'image'}
              <div class="media-thumb-placeholder" use:thumbObserve={asset}>
                <span class="media-ext">{extLabel(asset)}</span>
              </div>
            {:else}
              <div class="media-thumb-placeholder">
                <span class="media-ext">{extLabel(asset)}</span>
              </div>
            {/if}
          </div>
          <div class="media-info">
            <span class="media-name" title={asset.name}>{asset.name}</span>
            <span class="media-size">{formatMediaSize(asset.size)}</span>
          </div>
          <button
            class="media-delete"
            onclick={() => handleDelete(asset)}
            disabled={deletingPath === asset.path}
            title={$_('media.library.delete')}
            aria-label={$_('media.library.delete')}
          >
            <DeleteIcon />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .media-library {
    padding: 1rem;
    padding-bottom: 4rem;
    height: 100%;
    box-sizing: border-box;
  }

  .media-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .media-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text);
  }

  .back-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 6px;
    transition: opacity 0.2s;
  }

  .back-button:hover {
    opacity: 0.7;
  }

  .back-button :global(svg) {
    width: 20px;
    height: 20px;
  }

  .media-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .media-empty {
    font-size: 0.95rem;
  }

  .retry-button {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .retry-button:hover {
    opacity: 0.9;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .media-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .media-card:hover {
    border-color: var(--accent);
  }

  .media-thumb {
    aspect-ratio: 1 / 1;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .media-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .media-thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .media-ext {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .media-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.5rem;
    min-width: 0;
  }

  .media-name {
    font-size: 0.8125rem;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .media-size {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .media-delete {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--error);
    cursor: pointer;
    opacity: 0.85;
    transition:
      opacity 0.2s,
      border-color 0.2s;
  }

  .media-delete:hover:not(:disabled) {
    opacity: 1;
    border-color: var(--error);
  }

  .media-delete:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .media-delete :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
