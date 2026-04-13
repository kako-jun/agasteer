# カーソルトレイル機能

## 概要

カーソル移動時に残像（トレイル）エフェクトを表示する機能。Ghosttyターミナルのカーソルブレイズに着想を得た。WebGL2フラグメントシェーダーで前カーソル位置から現カーソル位置への軌跡を描画し、0.5秒でフェードアウトする。

## 実装ファイル

| ファイル                                        | 役割                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `src/lib/editor/cursor-trail.ts`                | WebGL2シェーダーとCodeMirror拡張のファクトリ |
| `src/components/editor/MarkdownEditor.svelte`   | 拡張機能の統合（設定に応じて有効化）         |
| `src/components/settings/EditorSettings.svelte` | カーソルトレイルのON/OFFトグル               |

## 設計と実装

### WebGL2シェーダー

フルスクリーン四角形にフラグメントシェーダーを適用する方式。各ピクセルについて、前カーソル位置から現カーソル位置への軌跡上のSDF（Signed Distance Field）を計算し、カーソルサイズ分の太さで描画する。

- **頂点シェーダー**: フルスクリーン四角形（2三角形）を描画
- **フラグメントシェーダー**: 軌跡SDFとフェードアウトを計算
  - 移動距離が小さい場合は矩形SDFにフォールバック
  - smoothstepで2pxのアンチエイリアシング
  - 前カーソル側を薄く、現カーソル側を濃くする距離ベース減衰
  - `pow(1.0 - t, 10.0)` の急峻なイージングでフェードアウト

### ViewPlugin（updateListener）

CodeMirrorの `EditorView.updateListener` を使い、以下のイベントを監視:

- **初回描画時**: `.cm-scroller` 内にcanvasを生成し、WebGL2コンテキストを初期化
- **selectionSet / docChanged**: カーソル座標を更新し、アニメーションループを再開
- **geometryChanged**: canvasをリサイズ

### 座標計算

`view.coordsAtPos()` でカーソルのビューポート座標を取得し、`.cm-scroller` のBoundingClientRectとの差分でscroller内相対座標に変換。devicePixelRatioを考慮してシェーダーに渡す。

### カーソル形状検出

Vimモードのブロックカーソル（`.cm-fat-cursor`クラス）を検出し、カーソルサイズを切り替える:

- **バーカーソル**: 幅2px、高さ = defaultLineHeight
- **ブロックカーソル**: 幅 = defaultCharacterWidth、高さ = defaultLineHeight

### アクセントカラー取得

`setupCanvas` 時にCSS変数 `--accent` を読み取り、一時DOMで `getComputedStyle` を経由してRGB値に変換。テーマ変更時は `$effect` によりエディタが再初期化されるため、`setupCanvas` が再実行されて最新のカラーが反映される。

## パフォーマンス最適化

### rAFの停止/再開

フェードアウト完了（elapsed > 0.6秒）でアニメーションループを停止し、次のカーソル移動で再開する。カーソルが静止している間はCPU/GPU負荷ゼロ。二重起動防止のガード付き。

### prefers-reduced-motion

- 初期化時に `matchMedia` でチェックし、有効なら空の拡張を返す
- 動的変更も `change` イベントで監視し、有効化されたらクリーンアップ

### モバイル無効化

`MarkdownEditor.svelte` 側でタッチデバイス＋画面幅768px以下を検出し、モバイルではカーソルトレイル拡張自体を生成しない。

### WebGLリソース管理

VAO、バッファ、プログラムをモジュールレベル変数で保持し、`cleanupInternal()` で `gl.deleteVertexArray()` / `gl.deleteBuffer()` / `gl.deleteProgram()` を呼んで確実に解放する。

## 設定オプション

デフォルトOFF。設定画面の「エディタ」セクションから「カーソルトレイルを有効にする」で切り替え可能。設定変更時はエディタ全体が再初期化される（`$effect` による検知）。
