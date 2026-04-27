/**
 * 行単位ダーティマーカー機能
 * 最後にPushした状態から変更された行にマーカーを表示する
 */

import type { Extension } from '@codemirror/state'

/**
 * LCS (Longest Common Subsequence) を計算
 * 基準と現在の行配列で共通する行（順序を保持）を見つける
 */
function computeLCS(baseLines: string[], currentLines: string[]): Set<number> {
  const m = baseLines.length
  const n = currentLines.length

  // DP テーブル
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (baseLines[i - 1] === currentLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // バックトラックしてLCSに含まれる現在の行インデックスを取得
  const lcsIndices = new Set<number>()
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (baseLines[i - 1] === currentLines[j - 1]) {
      lcsIndices.add(j) // 1-indexed
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return lcsIndices
}

/**
 * 行単位の差分を計算（LCSベース）
 * @param baseContent 基準コンテンツ（最後にPushした状態）
 * @param currentContent 現在のコンテンツ
 * @returns ダーティな行番号のSet（1-indexed）
 */
export function computeDirtyLines(baseContent: string | null, currentContent: string): Set<number> {
  const dirtyLines = new Set<number>()

  // 基準がnull = 新規リーフ → 全行がダーティ
  if (baseContent === null) {
    const lines = currentContent.split('\n')
    for (let i = 1; i <= lines.length; i++) {
      dirtyLines.add(i)
    }
    return dirtyLines
  }

  // 完全一致なら LCS をスキップ（O(n*m) を回避）
  if (baseContent === currentContent) {
    return dirtyLines
  }

  const baseLines = baseContent.split('\n')
  const currentLines = currentContent.split('\n')

  // LCSを計算して、LCSに含まれない行をダーティとしてマーク
  const lcsIndices = computeLCS(baseLines, currentLines)

  for (let i = 1; i <= currentLines.length; i++) {
    if (!lcsIndices.has(i)) {
      dirtyLines.add(i)
    }
  }

  return dirtyLines
}

/**
 * CodeMirrorのダーティライン拡張機能を作成するファクトリ
 * 動的インポート後に呼び出す
 *
 * @param modules CodeMirrorモジュール
 * @param getBaseContent 基準コンテンツを取得する関数（毎回呼び出してPush後の更新を反映）
 * @param debounceMs デバウンス時間（ミリ秒）
 */
export function createDirtyLineExtension(
  modules: {
    StateEffect: typeof import('@codemirror/state').StateEffect
    StateField: typeof import('@codemirror/state').StateField
    GutterMarker: typeof import('@codemirror/view').GutterMarker
    gutter: typeof import('@codemirror/view').gutter
    EditorView: typeof import('@codemirror/view').EditorView
  },
  getBaseContent: () => string | null,
  debounceMs: number = 200
): {
  extension: Extension
  updateDirtyLines: (view: InstanceType<typeof modules.EditorView>) => void
  cleanup: () => void
} {
  const { StateEffect, StateField, GutterMarker, gutter, EditorView } = modules

  // ダーティ行を更新するEffect
  const setDirtyLines = StateEffect.define<Set<number>>()

  // ダーティ行の状態を管理するStateField
  const dirtyLinesField = StateField.define<Set<number>>({
    create: () => new Set(),
    update(value, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setDirtyLines)) {
          return effect.value
        }
      }
      return value
    },
  })

  // ガターマーカークラス
  class DirtyLineMarker extends GutterMarker {
    toDOM() {
      const marker = document.createElement('div')
      marker.className = 'cm-dirty-line-marker'
      return marker
    }
  }

  const marker = new DirtyLineMarker()

  // ガター定義
  const dirtyLineGutter = gutter({
    class: 'cm-dirty-gutter',
    lineMarker(view, line) {
      const lineNo = view.state.doc.lineAt(line.from).number
      const dirtyLines = view.state.field(dirtyLinesField)
      return dirtyLines.has(lineNo) ? marker : null
    },
    // StateFieldが変更されたらガターを再描画する
    lineMarkerChange(update) {
      return update.transactions.some((tr) => tr.effects.some((e) => e.is(setDirtyLines)))
    },
  })

  // デバウンス用タイマー
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ダーティ行を更新する関数
  function updateDirtyLines(view: InstanceType<typeof EditorView>) {
    const currentContent = view.state.doc.toString()
    // baseContentを毎回動的に取得（Push後の更新を反映）
    const baseContent = getBaseContent()
    const dirtyLines = computeDirtyLines(baseContent, currentContent)

    view.dispatch({
      effects: setDirtyLines.of(dirtyLines),
    })
  }

  // デバウンス付き更新
  function debouncedUpdate(view: InstanceType<typeof EditorView>) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      updateDirtyLines(view)
      debounceTimer = null
    }, debounceMs)
  }

  // クリーンアップ関数
  function cleanup() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  // 拡張機能を返す
  const extension: Extension = [
    dirtyLinesField,
    dirtyLineGutter,
    // ドキュメント変更時にデバウンス付きで更新。
    // composition 中の dispatch は IME を確定させてしまう（#136）ため抑止する。
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.view.composing) {
        debouncedUpdate(update.view)
      }
    }),
    // #172: composition 終了時にもダーティ判定を再計算する。
    // 上のガードで composition 中は全てスキップされるため、composition が終わった
    // タイミングで明示的に更新しないと、Gboard 等で既存行のダーティマーカーが
    // 反映されず、次の docChanged（改行など）まで持ち越されて既存行＋新規行が
    // まとめてダーティ化されるように見える。
    EditorView.domEventHandlers({
      compositionend: (_event, view) => {
        debouncedUpdate(view)
      },
    }),
  ]

  return { extension, updateDirtyLines, cleanup }
}
