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
      // #175: doc が変更された transaction では、保持している line 番号を
      // 新しい doc に合わせて再マッピングする。これをしないと挿入・削除で
      // 行が前後にずれた瞬間にマーカーが視覚的に違う行へ移動して見える
      // （次の debouncedUpdate が走るまで 200ms 程度ズレが残る）。
      if (tr.docChanged && value.size > 0) {
        const oldDoc = tr.startState.doc
        const newDoc = tr.state.doc
        const next = new Set<number>()
        for (const lineNo of value) {
          if (lineNo < 1 || lineNo > oldDoc.lines) continue
          const oldLineFrom = oldDoc.line(lineNo).from
          const newPos = tr.changes.mapPos(oldLineFrom, 1)
          if (newPos < 0 || newPos > newDoc.length) continue
          next.add(newDoc.lineAt(newPos).number)
        }
        return next
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
      debounceTimer = null
      // #172 + #136: タイマー満了時に composition 中なら dispatch すると
      // IME を確定させてしまうので、その場では実行せず再度 debounce する。
      // これで composition が落ちた瞬間に updateDirtyLines が走るため、
      // compositionend を発火しない IME（#174: Gboard 日本語の変換確定など）
      // でも追従する。
      if (view.composing) {
        debouncedUpdate(view)
        return
      }
      updateDirtyLines(view)
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
    // ドキュメント変更時にデバウンス付きで更新を「スケジュール」する。
    // 実際の dispatch は debouncedUpdate のタイマー callback で view.composing を
    // 再チェックしてから行うため、ここでは composition 中でもスケジュールしてよい。
    // #136 で問題になった「dispatch が IME を確定させる」現象は debouncedUpdate
    // 側の retry ロジックで防いでいる。
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        debouncedUpdate(update.view)
      }
    }),
    // #172: compositionend を発火する IME（Gboard 英語で半角スペース確定など）の
    // 即応性を上げるための補助トリガー。Gboard 日本語の変換確定など
    // compositionend が来ない／直後に新しい composition が始まる IME では
    // 上の updateListener と debouncedUpdate の retry ループが追従する（#174）。
    EditorView.domEventHandlers({
      compositionend: (_event, view) => {
        debouncedUpdate(view)
      },
    }),
  ]

  return { extension, updateDirtyLines, cleanup }
}
