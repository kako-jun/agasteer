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
  import { createMediaLibraryController } from '../../lib/media/library-controller.svelte'
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

  // 状態と IO はコントローラへ。ここは配線（observer の DOM 接続・描画）だけを持つ
  const controller = createMediaLibraryController({
    listMediaAssets,
    deleteMediaAsset,
    resolveMedia,
    confirm: (message) => confirmAsync(message),
    toast: (message, variant) => showPushToast(message, variant),
    getSettings: () => settings,
    translate: (key, values) => $_(key, values ? { values } : undefined),
  })

  // 遅延解決の観測（DOM 配線）。$state 外（描画に不要）
  const elToAsset = new Map<Element, MediaAsset>()
  let observer: IntersectionObserver | null = null

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

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const asset = elToAsset.get(entry.target)
          if (asset) void controller.resolveThumb(asset)
          observer?.unobserve(entry.target)
        }
      },
      { rootMargin: '150px' }
    )
    void controller.load()
  })

  onDestroy(() => {
    observer?.disconnect()
    observer = null
    controller.dispose()
  })
</script>

<section class="media-library">
  <div class="media-header">
    <button class="back-button" onclick={onClose} aria-label={$_('media.library.back')}>
      <ArrowLeftIcon />
    </button>
    <h2>{$_('media.library.title')}</h2>
  </div>

  {#if controller.loadState === 'loading'}
    <div class="media-status">
      <LeafSpinner size={32} />
      <span>{$_('media.library.loading')}</span>
    </div>
  {:else if controller.loadState === 'error'}
    <div class="media-status">
      <p>{$_(controller.errorMessageKey)}</p>
      <button class="retry-button" onclick={() => controller.retry()}
        >{$_('media.library.retry')}</button
      >
    </div>
  {:else if controller.assets.length === 0}
    <div class="media-status media-empty">{$_('media.library.empty')}</div>
  {:else}
    <div class="media-grid">
      {#each controller.assets as asset (asset.path)}
        <div class="media-card">
          <div class="media-thumb">
            {#if controller.kindOf(asset) === 'image' && controller.thumbUrls[asset.rawUrl]}
              <img src={controller.thumbUrls[asset.rawUrl]} alt={asset.name} />
            {:else if controller.kindOf(asset) === 'image'}
              <div class="media-thumb-placeholder" use:thumbObserve={asset}>
                <span class="media-ext">{controller.extLabel(asset)}</span>
              </div>
            {:else}
              <div class="media-thumb-placeholder">
                <span class="media-ext">{controller.extLabel(asset)}</span>
              </div>
            {/if}
          </div>
          <div class="media-info">
            <span class="media-name" title={asset.name}>{asset.name}</span>
            <span class="media-size">{formatMediaSize(asset.size)}</span>
          </div>
          <button
            class="media-delete"
            onclick={() => controller.handleDelete(asset)}
            disabled={controller.deletingPath === asset.path}
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
    transition: opacity 0.2s;
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
