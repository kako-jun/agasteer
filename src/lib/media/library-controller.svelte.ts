/**
 * メディアライブラリ画面のコントローラ（#250・テスト可能化抽出）
 *
 * `MediaLibraryView.svelte` にインラインだった状態機械と IO を、依存注入可能な
 * 素のファクトリに切り出したもの（#244 の `createPreviewMediaResolver` と同じ流儀）。
 * IntersectionObserver の DOM 配線・確認ダイアログ本体・グリッド描画は Svelte 側に
 * 残し、状態（loading/loaded/error・assets・thumbUrls・deletingPath）と副作用
 * （一覧取得・削除・サムネイル解決・Blob URL ライフサイクル）だけをここへ移した。
 *
 * リアクティビティは Svelte 5 runes（`$state` + getter）で提供する。ストア群
 * （`leaf-stats.svelte.ts` 等）と同じファクトリ + getter パターンなので、
 * View は `controller.assets` 等を素直に読むだけの薄い配線になる。
 *
 * 抽出は挙動不変。書き込み順・disposed ガードの位置・二重 disposed チェック等は
 * 元コンポーネントの逐次を 1:1 で保っている（詳細は各メソッドのコメント）。
 */

import type { Settings } from '../types'
import type { MediaAsset, MediaListResult, MediaDeleteResult } from '../api/media-library'
import type { MediaFetchResult } from '../api/media'
import {
  classifyPreviewMediaKind,
  previewMediaMimeType,
  type PreviewMediaKind,
} from '../preview/media-resolve'
import { collectMediaReferenceUrls } from '../api/media/library'
import { getMediaExtension } from '../api/media/naming'

export type MediaLibraryLoadState = 'loading' | 'loaded' | 'error'

/**
 * コントローラの依存。IO・確認/通知・設定取得・翻訳を注入する
 * （テストはフェイクを渡し、View は本物の実装を渡す）。
 * 純粋な種別判定・MIME・拡張子（classifyPreviewMediaKind 等）は副作用がないため
 * 注入せず直接 import する（#244 が parseRawMediaUrl を直接使うのと同じ扱い）。
 */
export interface MediaLibraryControllerDeps {
  listMediaAssets: (settings: Settings) => Promise<MediaListResult>
  deleteMediaAsset: (settings: Settings, path: string, sha: string) => Promise<MediaDeleteResult>
  resolveMedia: (url: string, settings: Settings) => Promise<MediaFetchResult>
  /** 確認ダイアログ（true=OK / false=キャンセル）。本体表示は App 側の modal が担う */
  confirm: (message: string) => Promise<boolean>
  /** 完了/失敗トースト */
  toast: (message: string, variant: 'success' | 'error') => void
  /** 現在の設定を返す（View の prop が更新され得るため getter で受ける） */
  getSettings: () => Settings
  /** i18n キー → 文言。one-shot なメッセージ（confirm/toast）に使う */
  translate: (key: string, values?: Record<string, string | number>) => string
  /**
   * 孤児判定（#250）に使う全リーフ本文を返す。
   * `complete: false`（= Archive 未ロードで本文が揃っていない）のときは
   * 判定を保留する（誤った「未参照」表示が削除を誘発しないため）。
   */
  getReferenceContents: () => { contents: string[]; complete: boolean }
}

export interface MediaLibraryController {
  readonly loadState: MediaLibraryLoadState
  readonly assets: MediaAsset[]
  /** Trees API 応答が上限で切り詰められた（一覧は一部のみ）。UI で明示する（#258） */
  readonly truncated: boolean
  /**
   * 孤児（未参照）判定が有効か（#250）。Archive 未ロード時は false になり、
   * View は判定保留の案内を出す（バッジは一切出さない）
   */
  readonly orphanCheckAvailable: boolean
  readonly errorKind: string | null
  /** error 表示に使う i18n キー（文言化＝locale 反応は View 側の $_ に委ねる） */
  readonly errorMessageKey: string
  readonly deletingPath: string | null
  readonly thumbUrls: Record<string, string>
  kindOf(asset: MediaAsset): PreviewMediaKind
  extLabel(asset: MediaAsset): string
  /** どのリーフ本文からも参照されていない（孤児）か。判定無効時は常に false（#250） */
  isOrphan(asset: MediaAsset): boolean
  load(): Promise<void>
  retry(): Promise<void>
  resolveThumb(asset: MediaAsset): Promise<void>
  handleDelete(asset: MediaAsset): Promise<void>
  dispose(): void
}

export function createMediaLibraryController(
  deps: MediaLibraryControllerDeps
): MediaLibraryController {
  let loadState = $state<MediaLibraryLoadState>('loading')
  let assets = $state<MediaAsset[]>([])
  let truncated = $state<boolean>(false)
  /**
   * 孤児判定の参照集合（#250）。null = 判定保留（Archive 未ロード）。
   *
   * load 時のスナップショットでなく $derived にする: メディア画面を開いたまま
   * 反対ペインで編集され参照が増減しても、バッジが陳腐化して「未参照（削除
   * しても壊れない）」の誤表示が削除を誘発しないため（レビュー指摘）。
   * deps.getReferenceContents が reactive store（leaves 等）を読む getter で
   * ある限り、その変更で自動再計算される（テストの素の closure では静的なまま）。
   * derived は読み取り時に遅延評価されるため、画面が出ていない間のコストはない。
   */
  const referencedUrls = $derived.by<Set<string> | null>(() => {
    const { contents, complete } = deps.getReferenceContents()
    return complete ? collectMediaReferenceUrls(contents) : null
  })
  let errorKind = $state<string | null>(null)
  /** 削除中のアセット path（ボタン二度押し防止） */
  let deletingPath = $state<string | null>(null)
  /** rawUrl → サムネイルの Blob URL（解決済みのみ） */
  let thumbUrls = $state<Record<string, string>>({})

  // 解決の重複防止・破棄フラグ。描画に不要なので $state 外に置く
  const resolving = new Set<string>()
  let disposed = false

  function kindOf(asset: MediaAsset): PreviewMediaKind {
    return classifyPreviewMediaKind(asset.rawUrl) ?? 'download'
  }

  function extLabel(asset: MediaAsset): string {
    return getMediaExtension(asset.name).toUpperCase() || 'FILE'
  }

  async function load(): Promise<void> {
    // loading への遷移と errorKind クリアは await 前（disposed でも書き込む点まで元と同一）
    loadState = 'loading'
    errorKind = null
    const result = await deps.listMediaAssets(deps.getSettings())
    if (disposed) return
    // strict でない tsconfig では !result.ok の narrowing が効かないため in 演算子で判別
    if ('errorKind' in result) {
      errorKind = result.errorKind
      loadState = 'error'
      return
    }
    assets = result.assets
    truncated = result.truncated
    loadState = 'loaded'
  }

  function isOrphan(asset: MediaAsset): boolean {
    return referencedUrls !== null && !referencedUrls.has(asset.rawUrl)
  }

  /** 表示領域に入った画像アセットを 1 回だけ解決して Blob URL を作る */
  async function resolveThumb(asset: MediaAsset): Promise<void> {
    // 解決対象は画像のみ（元は template の {#if kindOf===image} で observer を張る側で gating）
    if (kindOf(asset) !== 'image') return
    if (thumbUrls[asset.rawUrl] || resolving.has(asset.rawUrl)) return
    resolving.add(asset.rawUrl)
    let result: MediaFetchResult
    try {
      result = await deps.resolveMedia(asset.rawUrl, deps.getSettings())
    } catch (error) {
      // resolveMedia は結果オブジェクト契約（throw しない）だが、万一 reject しても
      // resolving に残してリークさせず・unhandledRejection にせず、サムネイル無し扱いにする
      // （#244 createPreviewMediaResolver の .catch と同型）。
      console.warn('Media thumbnail resolve failed:', error)
      return
    } finally {
      // 成功・失敗いずれでも in-flight から外す（再試行できるようにする）
      resolving.delete(asset.rawUrl)
    }
    if (disposed || !result.ok) return
    const blobUrl = URL.createObjectURL(
      new Blob([result.data], { type: previewMediaMimeType(asset.name) })
    )
    // 解決中に破棄された／該当アセットが削除で assets から消えた場合は、生成した Blob を
    // 孤児化させず即 revoke する（#244 の dispose ガードと同型。thumbUrls にも載せない）。
    if (disposed || !assets.some((a) => a.rawUrl === asset.rawUrl)) {
      URL.revokeObjectURL(blobUrl)
      return
    }
    thumbUrls = { ...thumbUrls, [asset.rawUrl]: blobUrl }
  }

  async function handleDelete(asset: MediaAsset): Promise<void> {
    // 連打ガード（元は delete ボタンの disabled={deletingPath === asset.path} が担っていた）
    if (asset.path === deletingPath) return
    // 未参照バッジ（「削除しても壊れない」）と汎用警告（「参照中なら壊れる」）が
    // 同じアセットで矛盾しないよう、未参照確定時は専用の確認文言を出す（#250）
    const confirmed = await deps.confirm(
      deps.translate(
        isOrphan(asset) ? 'media.library.deleteConfirmOrphan' : 'media.library.deleteConfirm',
        { name: asset.name }
      )
    )
    if (!confirmed || disposed) return
    deletingPath = asset.path
    const result = await deps.deleteMediaAsset(deps.getSettings(), asset.path, asset.sha)
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
      deps.toast(deps.translate('media.library.deleted', { name: asset.name }), 'success')
    } else {
      deps.toast(deps.translate('media.library.deleteFailed'), 'error')
    }
  }

  /** onDestroy 相当。保持中の Blob URL を全て解放する（リーク防止） */
  function dispose(): void {
    disposed = true
    for (const blobUrl of Object.values(thumbUrls)) {
      URL.revokeObjectURL(blobUrl)
    }
    thumbUrls = {}
  }

  return {
    get loadState() {
      return loadState
    },
    get assets() {
      return assets
    },
    get truncated() {
      return truncated
    },
    get orphanCheckAvailable() {
      return referencedUrls !== null
    },
    get errorKind() {
      return errorKind
    },
    get errorMessageKey() {
      // 未設定はライブラリ画面文脈の専用文言（media.errors.* は添付フロー寄りの文言のため）
      return errorKind === 'not_configured'
        ? 'media.library.notConfigured'
        : 'media.library.loadFailed'
    },
    get deletingPath() {
      return deletingPath
    },
    get thumbUrls() {
      return thumbUrls
    },
    kindOf,
    extLabel,
    isOrphan,
    load,
    retry: load,
    resolveThumb,
    handleDelete,
    dispose,
  }
}
