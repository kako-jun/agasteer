## PWA対応

### 概要

スマホでホーム画面に追加した際、ネイティブアプリのように起動できるPWA（Progressive Web App）機能。

### 実装

#### 1. Web App Manifest

`vite.config.ts` で `vite-plugin-pwa` を使用。主な設定：

| 設定項目     | 値               |
| ------------ | ---------------- |
| registerType | autoUpdate       |
| display      | standalone       |
| theme_color  | #1a1a1a          |
| icons        | 192x192, 512x512 |

#### 2. アイコン

- 青い背景（#2196F3）
- 白文字「md」
- サイズ: 192x192, 512x512

#### 3. favicon

ブラウザタブ用の32×32アイコン。

### 動作

#### スマホでの挙動

1. **ホーム画面に追加前**: 通常のWebサイトとして動作
2. **ホーム画面に追加**: Chromeの「ホーム画面に追加」機能で追加
3. **起動時**: ブラウザUIが非表示になり、スタンドアロンモードで起動
   - アドレスバー非表示
   - タブUI非表示
   - ネイティブアプリのような見た目

### Service Worker

キャッシュ戦略：

- **静的アセット**: `precache`（ビルド時に全て登録）
- **GitHub API**: `NetworkFirst`（ネットワーク優先、5分キャッシュ）

### PWA更新フロー

新しいバージョンがデプロイされた場合、初回Pullより先に更新を適用します。これにより、API制限の節約と古いコードでのPull実行を回避できます。

#### フロー

1. アプリ起動
2. main.tsで`registerSW`（immediate: true）
3. App.svelte onMount で`waitForSwCheck`を待機
4. 新しいSWあり → `onNeedRefresh` → 即座にリロード（Pullなし）
5. 新しいSWなし or タイムアウト(500ms) → `handlePull(true)`

**設計のポイント:**

- `waitForSwCheck`: main.tsからexportされるPromise
- App.svelteで`await`することで、SWチェック完了を確実に待つ
- タイムアウト500ms: SWがサポートされていない環境でも動作
- 更新があればリロードされ、Pullは走らない

### 仕様

- **オフライン動作**: 限定的（初回Pullが必須のため）
- **自動更新**: Service Workerは自動更新、新バージョン検知で即座にリロード
- **プラットフォーム**: iOS Safari, Android Chrome, Desktop Chrome対応

### PWA復帰時のレイアウト修復

PWAがバックグラウンドから復帰した際に、レイアウトが崩れる問題（フッターが画面外に出る等）への対策。

#### 問題

- PWAで外部リンクをタップして別アプリに遷移
- PWAに戻った際、ビューポートやレイアウトが正しく再計算されない
- フッターが画面外にスクロールされた状態になる

#### 解決策

`visibilitychange`イベントで画面復帰を検知し、以下を実行：

1. **resizeイベントのトリガー**: レイアウトの再計算を促す
2. **フッター位置チェック**: フッターが画面外にあるか確認
3. **スクロールリセット**: フッターが画面外にある場合、`.main-pane`のスクロール位置を0にリセット

**関連ファイル**: `app-state.svelte.ts` (`handleVisibilityChange`)

---
