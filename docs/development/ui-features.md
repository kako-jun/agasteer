# UI/UX機能

SimplestNote.mdのUI/UX関連機能の実装詳細について説明します。

## 2ペイン表示

### アスペクト比判定

画面のアスペクト比（横 > 縦）で2ペイン表示を自動切替。

```typescript
// アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
const updateDualPane = () => {
  isDualPane = window.innerWidth > window.innerHeight
}
updateDualPane()

window.addEventListener('resize', updateDualPane)
```

### レスポンシブレイアウト

```svelte
<div class="content-wrapper" class:single-pane={!isDualPane}>
  <div class="pane-divider" class:hidden={!isDualPane}></div>
  <div class="left-column">
    <!-- 左ペイン -->
  </div>
  <div class="right-column" class:hidden={!isDualPane}>
    <!-- 右ペイン -->
  </div>
</div>
```

### CSS Grid切替

```css
.content-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* ... */
}

.content-wrapper.single-pane {
  grid-template-columns: 1fr;
}

.hidden {
  display: none;
}
```

### 動作

- **スマホ縦向き**: 1ペイン表示
- **スマホ横向き**: 2ペイン表示
- **PC横長画面**: 2ペイン表示
- **画面回転時**: 自動的に切り替わる

---

## カスタムフォント機能

### 概要

ユーザーが自由にフォントファイルをアップロードして、アプリ全体のフォントを変更できる機能。サーバー側にフォントを持たず、完全にクライアントサイド（IndexedDB）で保存・管理する。

### 技術実装

#### フォントの読み込みと保存

```typescript
// FileReader APIでフォントファイルを読み込み
async function loadFontFile(file: File): Promise<CustomFont> {
  const reader = new FileReader()
  const arrayBuffer = await reader.readAsArrayBuffer(file)

  return {
    name: 'custom',
    data: arrayBuffer,
    type: file.type || 'font/ttf',
  }
}

// IndexedDBに保存
await saveCustomFont(font)
```

#### CSS @font-faceによる動的適用

```typescript
function applyCustomFont(font: CustomFont): void {
  const blob = new Blob([font.data], { type: font.type })
  const url = URL.createObjectURL(blob)

  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: 'CustomUserFont';
      src: url(${url}) format('truetype');
    }

    body, input, textarea, button, .cm-editor {
      font-family: 'CustomUserFont', sans-serif !important;
    }
  `

  document.head.appendChild(style)
}
```

#### フォントの削除

```typescript
function removeCustomFont(): void {
  // スタイル要素を削除するだけで、デフォルトCSSに自動的に戻る
  if (currentFontStyleElement) {
    currentFontStyleElement.remove()
    currentFontStyleElement = null
  }
}
```

### UI/UX

#### 設定画面のUI要素

- **「フォント選択」ボタン**: ファイル選択ダイアログを開く
- **「デフォルトに戻す」ボタン**: カスタムフォントを削除（確認なし）
- **対応フォーマット表示**: `.ttf`, `.otf`, `.woff`, `.woff2`
- **アップロード状態表示**: アップロード中は「アップロード中...」と表示

#### 操作フロー

1. 設定画面を開く
2. 「フォント選択」ボタンをクリック
3. フォントファイルを選択
4. **即座に適用**（リロード不要）
5. 「デフォルトに戻す」で元に戻す（リロード不要）

### 仕様

- **同時保存数**: 1つのみ（新しいフォントは自動で上書き）
- **保存場所**: IndexedDB `fonts` オブジェクトストア
- **設定フラグ**: `Settings.hasCustomFont` (boolean) をLocalStorageに保存
- **適用範囲**: body, input, textarea, button, CodeMirrorエディタ
- **リロード**: 適用・削除ともにリロード不要
- **起動時復元**: `hasCustomFont`フラグがtrueの場合、自動で適用

### セキュリティ

- **拡張子チェック**: `.ttf`, `.otf`, `.woff`, `.woff2` のみ許可
- **Blobベース読み込み**: `URL.createObjectURL()`で安全に適用
- **クライアントサイド完結**: サーバーにフォントファイルをアップロードしない

---

## カスタム背景画像機能

### 概要

ユーザーが左右ペイン別々に背景画像を設定できる機能。テーマの背景色の上に、半透明の画像を重ねて表示する。サーバー側に画像を持たず、完全にクライアントサイド（IndexedDB）で保存・管理する。

### 技術実装

#### 画像の読み込みと保存

```typescript
// FileReader APIで画像ファイルを読み込み
async function loadBackgroundFile(file: File): Promise<CustomBackground> {
  const reader = new FileReader()
  const arrayBuffer = await reader.readAsArrayBuffer(file)

  return {
    name: 'custom-left', // または 'custom-right'
    data: arrayBuffer,
    type: file.type || 'image/jpeg',
  }
}

// IndexedDBに保存
await saveCustomBackground(background)
```

#### CSS ::before擬似要素による動的適用

```typescript
function applyCustomBackgrounds(
  leftBackground: CustomBackground | null,
  rightBackground: CustomBackground | null,
  leftOpacity: number = 0.1,
  rightOpacity: number = 0.1
): void {
  const style = document.createElement('style')
  let css = `
    /* 基本スタイル */
    .main-pane {
      position: relative;
      background: var(--bg-primary); /* テーマの背景色 */
    }

    .main-pane > * {
      position: relative;
      z-index: 1;
      background: transparent; /* 子要素の背景を透明化 */
    }
  `

  // 左ペインの背景画像
  if (leftBackground) {
    const blob = new Blob([leftBackground.data], { type: leftBackground.type })
    const url = URL.createObjectURL(blob)

    css += `
    .left-column .main-pane::before,
    .settings-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url(${url});
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: ${leftOpacity};
      pointer-events: none;
      z-index: 0;
    }
    `
  }

  // 右ペインの背景画像（同様）
  document.head.appendChild(style)
}
```

#### 画像の削除

```typescript
async function removeAndDeleteCustomBackgroundLeft(): Promise<void> {
  await deleteCustomBackground('custom-left')

  // 右ペインの背景を保持したまま再適用
  const rightBackground = await loadCustomBackground('custom-right')
  await applyCustomBackgrounds(null, rightBackground, 0.1, 0.1)
}
```

### UI/UX

#### 設定画面のUI要素（左右2列レイアウト）

- **左ペイン設定エリア**:
  - **プレビューエリア**（画像設定時のみ表示）
    - 高さ: 120px
    - テーマの背景色 + 半透明の画像（透明度0.1）
    - 中央に「プレビュー」ラベル
    - 角丸8px
  - 「背景画像選択」ボタン
  - 「デフォルトに戻す」ボタン（設定時のみ表示）

- **右ペイン設定エリア**:
  - **プレビューエリア**（画像設定時のみ表示）
    - 高さ: 120px
    - テーマの背景色 + 半透明の画像（透明度0.1）
    - 中央に「プレビュー」ラベル
    - 角丸8px
  - 「背景画像選択」ボタン
  - 「デフォルトに戻す」ボタン（設定時のみ表示）

- **対応フォーマット表示**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- **アップロード状態表示**: アップロード中は「アップロード中...」と表示

#### 操作フロー

1. 設定画面を開く
2. 左ペイン（または右ペイン）の「背景画像選択」ボタンをクリック
3. 画像ファイルを選択
4. **即座に適用**（リロード不要）
5. **設定画面のプレビューエリアに画像が表示される**
   - 各ペインの設定エリア内に120px高さのプレビューボックスが表示
   - テーマの背景色の上に半透明（透明度0.1）で画像が重なる
   - 「プレビュー」ラベルが中央に表示
   - スクロールせずに見える位置に配置
6. 「デフォルトに戻す」で元に戻す（リロード不要、プレビューも消える）

### 仕様

- **同時保存数**: 左右それぞれ1つ（新しい画像は自動で上書き）
- **保存場所**: IndexedDB `backgrounds` オブジェクトストア
  - 左ペイン: キー `'custom-left'`
  - 右ペイン: キー `'custom-right'`
- **設定フラグ**: LocalStorageに以下を保存
  - `Settings.hasCustomBackgroundLeft` (boolean)
  - `Settings.hasCustomBackgroundRight` (boolean)
  - `Settings.backgroundOpacityLeft` (number, デフォルト: 0.1)
  - `Settings.backgroundOpacityRight` (number, デフォルト: 0.1)
- **適用範囲**:
  - 左ペイン: `.left-column .main-pane::before`
  - 右ペイン: `.right-column .main-pane::before`
  - 設定画面プレビュー:
    - 左ペイン: `.background-preview-left::after`
    - 右ペイン: `.background-preview-right::after`
- **透明度**: 0.1（固定）
- **表示方式**: テーマの背景色の上に半透明の画像を重ねる
- **リロード**: 適用・削除ともにリロード不要
- **起動時復元**: フラグがtrueの場合、自動で適用

### 実装の詳細

#### z-indexによる重ね順

```
z-index: 0  →  .main-pane::before（背景画像）
               ↓
               .main-pane（テーマの背景色）
               ↓
z-index: 1  →  .main-pane > *（コンテンツ）
```

- **テーマの背景色**: `.main-pane { background: var(--bg-primary); }`
- **背景画像**: `::before { opacity: 0.1; z-index: 0; }`
- **コンテンツ**: `.main-pane > * { background: transparent; z-index: 1; }`

#### CodeMirrorエディタの背景透過

```css
.cm-editor,
.cm-scroller,
.cm-content {
  background: transparent !important;
}
```

CodeMirrorは独自の背景色を持つため、`!important`で強制的に透過させる。

### セキュリティ

- **拡張子チェック**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` のみ許可
- **Blobベース読み込み**: `URL.createObjectURL()`で安全に適用
- **クライアントサイド完結**: サーバーに画像ファイルをアップロードしない
- **XSS対策**: Blob URLを使用し、直接HTMLに挿入しない

---

## 国際化（i18n）機能

### 概要

アプリケーション全体を多言語対応にする機能。ブラウザの言語設定を自動検出し、適切な言語で表示する。ユーザーは設定画面で手動で言語を切り替えることも可能。

### 対応言語

- **日本語（ja）**: 日本語UI
- **英語（en）**: 英語UI（デフォルト）

### 技術実装

#### ライブラリ

**svelte-i18n**を使用：

- Svelte公式コミュニティで最も使われている
- TypeScript完全対応
- ローディング状態の管理が簡単
- フォールバック機能あり

#### 翻訳ファイル

`src/lib/i18n/locales/` に配置：

```
src/lib/i18n/
├── index.ts          # i18n初期化とストア
└── locales/
    ├── en.json       # 英語翻訳
    └── ja.json       # 日本語翻訳
```

翻訳ファイルの構造例：

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "ok": "OK"
  },
  "settings": {
    "title": "Settings",
    "github": {
      "title": "GitHub Integration",
      "repoName": "Repository (owner/repo)"
    }
  }
}
```

#### 初期化処理

```typescript
import { register, init, waitLocale, getLocaleFromNavigator } from 'svelte-i18n'
import type { Locale } from '../types'

// 翻訳ファイルを登録（動的インポート）
register('ja', () => import('./locales/ja.json'))
register('en', () => import('./locales/en.json'))

export async function initI18n(savedLocale?: Locale): Promise<void> {
  if (savedLocale) {
    // 保存された設定を使用
    init({
      fallbackLocale: 'en',
      initialLocale: savedLocale,
    })
    await waitLocale(savedLocale)
    return
  }

  // ブラウザの言語設定を検出
  const browserLocale = getLocaleFromNavigator()
  const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'

  init({
    fallbackLocale: 'en',
    initialLocale: detectedLocale,
  })

  await waitLocale(detectedLocale)
}
```

#### アプリ起動時の待機処理

```svelte
<script>
  import { initI18n } from './lib/i18n'

  let i18nReady = false

  onMount(async () => {
    const loadedSettings = loadSettings()

    // i18n初期化（翻訳読み込み完了を待機）
    await initI18n(loadedSettings.locale)
    i18nReady = true
  })
</script>

{#if !i18nReady}
  <!-- ローディング画面 -->
  <div class="i18n-loading">
    <div class="loading-spinner">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  </div>
{:else}
  <!-- メインアプリケーション -->
  <div class="app-container">
    <!-- ... -->
  </div>
{/if}
```

#### コンポーネントでの使用

```svelte
<script>
  import { _ } from '../../lib/i18n'
</script>

<button on:click={handleSave}>
  {$_('common.save')}
</button>

<label for="repo-name">
  {$_('settings.github.repoName')}
</label>
```

### UI/UX

#### 言語自動検出

初回訪問時、ブラウザの言語設定を自動検出：

| ブラウザ言語  | 表示言語           |
| ------------- | ------------------ |
| `ja`, `ja-JP` | 日本語             |
| `en-US`       | 英語               |
| `zh-CN`       | 英語（デフォルト） |
| `ko-KR`       | 英語（デフォルト） |
| その他        | 英語（デフォルト） |

**検出ロジック**:

```typescript
const browserLocale = getLocaleFromNavigator()
const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'
```

日本語（`ja`）で始まる場合のみ日本語、それ以外は全て英語。

#### 手動言語切替

設定画面に言語選択ドロップダウンを配置：

```svelte
<label for="language">Language / 言語</label>
<select id="language" bind:value={settings.locale} on:change={handleLocaleChange}>
  <option value="en">English</option>
  <option value="ja">日本語</option>
</select>
```

言語切替処理：

```typescript
function handleLocaleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Locale

  // 即座に言語を切り替え
  locale.set(value)

  // 設定を保存
  settings.locale = value
  onSettingsChange({ locale: value })
}
```

#### ローディング画面

翻訳ファイル読み込み中は、3つのドットのパルスアニメーションを表示：

```css
.i18n-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.loading-spinner .dot {
  width: 12px;
  height: 12px;
  background: var(--accent-color);
  border-radius: 50%;
  animation: pulse 1.4s ease-in-out infinite;
}
```

### 仕様

- **デフォルト言語**: 英語（en）
- **サポート言語**: 日本語（ja）、英語（en）
- **保存場所**: LocalStorage `Settings.locale`
- **ローディング**: 翻訳ファイルは動的インポート（コード分割）
- **フォールバック**: 翻訳が見つからない場合は英語表示
- **リアルタイム切替**: 言語変更は即座に反映（リロード不要）
- **永続化**: 選択した言語はLocalStorageに保存され、次回起動時に復元

### 翻訳対象

以下の全UIテキストが翻訳対象：

- **共通要素**: ボタン（保存、キャンセル、削除、OK）
- **ヘッダー**: 設定ボタン
- **パンくずリスト**: ホームへ移動、編集ボタン
- **ホーム画面**: Push回数ラベル
- **ノート画面**: 更新ラベル
- **フッター**: 新規ノート、新規リーフ、削除、ダウンロード、プレビュー、保存
- **設定画面**: 全セクション（GitHub連携、テーマ、フォント、背景画像、ツール名など）
- **トースト通知**: Pull/Push成功/失敗メッセージ
- **モーダル**: 確認ダイアログ、エラーメッセージ
- **ローディング**: Pull中、Push中

### パフォーマンス

#### バンドルサイズ

```
dist/assets/ja-CwwTm2-M.js    2.00 kB │ gzip:  1.43 kB
dist/assets/en-DLi_lTuS.js    2.42 kB │ gzip:  1.10 kB
```

- 翻訳ファイルは動的インポート
- 使用する言語のみロード
- gzip圧縮で1.4KB程度

#### 初期化時間

- 翻訳ファイルの読み込み: ~10-50ms
- ローディング画面はほぼ一瞬（体感できないレベル）

### セキュリティ

- **XSS対策**: 翻訳文字列はエスケープ処理済み
- **JSONバリデーション**: svelte-i18nが型安全性を保証
- **静的ファイル**: 翻訳ファイルは静的JSON（実行コードなし）

---

## その他のUI改善

### GitHub設定画面の改善

#### 必須項目マーク

Repository (owner/repo)とGitHub Tokenの入力欄に赤いアスタリスク（\*）で必須であることを表示。

```svelte
<label for="repo-name">
  {$_('settings.github.repoName')} <span class="required">*</span>
</label>
```

```css
.required {
  color: #e74c3c;
  font-weight: bold;
}
```

#### リポジトリを開くボタン

Repository入力欄の右にGitHubリポジトリを直接開けるリンクボタンを配置。

```svelte
<div class="input-with-button">
  <input type="text" bind:value={settings.repoName} />
  {#if settings.repoName}
    <a
      href="https://github.com/{settings.repoName}"
      target="_blank"
      rel="noopener noreferrer"
      class="repo-link-button"
      title="Open repository on GitHub"
    >
      <svg><!-- 外部リンクアイコン --></svg>
    </a>
  {/if}
</div>
```

**機能:**

- リポジトリ名が入力されている場合のみ表示
- 新しいタブでGitHubリポジトリを開く
- ホバー時にアクセントカラーに変化

#### スマホ対応

画面幅600px以下では、GitHub設定の入力欄を縦1列に配置。

```css
@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
  }
}
```

### GitHub Sponsorsリンク

設定画面の最下部にGitHub Sponsorsへのリンクボタンを配置。

```svelte
<div class="sponsor-section">
  <a
    href="https://github.com/sponsors/kako-jun"
    target="_blank"
    rel="noopener noreferrer"
    class="sponsor-link"
  >
    <svg class="heart-icon"><!-- ハートアイコン --></svg>
    <span>Sponsor on GitHub</span>
  </a>
</div>
```

**デザイン:**

- 他のボタンと統一したスタイル
- ハートアイコンにビートアニメーション（鼓動エフェクト）
- ホバー時にアクセントカラーに変化

```css
@keyframes heartbeat {
  0%,
  100% {
    transform: scale(1);
  }
  10%,
  30% {
    transform: scale(1.1);
  }
  20%,
  40% {
    transform: scale(1);
  }
}
```

### プッシュカウントの表示改善

ホーム画面のPush回数表示に3桁カンマ区切りを適用。

```svelte
<div class="stat-value">{$metadata.pushCount.toLocaleString()}</div>
```

**例:**

- 100 → 100
- 1,000 → 1,000
- 1,234,567 → 1,234,567

### Languageドロップダウンのカスタム矢印

ブラウザデフォルトの矢印を無効化し、カスタムCSS矢印を使用。テーマカラーに合わせて変化。

```css
select {
  appearance: none;
  padding-right: 2rem;
}

.select-wrapper::after {
  content: '';
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--text-primary);
}
```

**メリット:**

- 右端からの距離を完全にコントロール可能
- テーマの色に自動的に追従
- 一貫したデザイン

---

## シェア機能

### 概要

リーフのURLやコンテンツをコピーして共有するための機能。パンくずリストから直接アクセス可能。

### 機能

#### 1. URLコピー

現在表示中のページのURLをクリップボードにコピー。

```typescript
function handleCopyUrl(pane: Pane) {
  const url = window.location.href
  navigator.clipboard
    .writeText(url)
    .then(() => {
      showPushToast('URLをコピーしました', 'success')
    })
    .catch((err) => {
      console.error('URLのコピーに失敗しました:', err)
      showPushToast('URLのコピーに失敗しました', 'error')
    })
}
```

**ユースケース:**

- 同じリーフをスマホとPCで開く
- 他のユーザーに特定のリーフを共有
- ブックマークとして保存

#### 2. Markdownコピー

現在編集中のリーフのMarkdownコンテンツをクリップボードにコピー。

```typescript
function handleCopyMarkdown(pane: Pane) {
  const leaf = pane === 'left' ? leftLeaf : rightLeaf
  if (!leaf) return

  navigator.clipboard
    .writeText(leaf.content)
    .then(() => {
      showPushToast('Markdownをコピーしました', 'success')
    })
    .catch((err) => {
      console.error('Markdownのコピーに失敗しました:', err)
      showPushToast('Markdownのコピーに失敗しました', 'error')
    })
}
```

**ユースケース:**

- 他のMarkdownエディタで編集
- メールやチャットで共有
- 別のノートアプリに移行

### UI実装

パンくずリスト（Breadcrumbs.svelte）にシェアボタンを配置：

```svelte
<Breadcrumbs
  {breadcrumbs}
  onCopyUrl={() => handleCopyUrl('left')}
  onCopyMarkdown={() => handleCopyMarkdown('left')}
/>
```

**表示条件:**

- リーフ表示時（EditorView, PreviewView）のみ表示
- ホーム画面やノート画面では非表示

### 仕様

- **対象**: リーフのみ（ノートは対象外）
- **左右ペイン**: 各ペインで独立して動作
- **フィードバック**: トースト通知で成功/失敗を通知
- **i18n対応**: 日本語・英語の翻訳あり

---

## PWA対応

### 概要

スマホでホーム画面に追加した際、ネイティブアプリのように起動できるPWA（Progressive Web App）機能。

### 実装

#### 1. Web App Manifest

`vite.config.ts` で `vite-plugin-pwa` を使用：

```typescript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.github\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'github-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 5, // 5分
          },
        },
      },
    ],
  },
  manifest: {
    name: 'SimplestNote.md',
    short_name: 'SimplestNote',
    description: 'A simple markdown note-taking app with GitHub sync',
    theme_color: '#1a1a1a',
    background_color: '#1a1a1a',
    display: 'standalone',
    start_url: '/',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
})
```

#### 2. アイコン

ImageMagickで生成：

```bash
# 192x192
convert -size 192x192 xc:'#2196F3' -fill white -font DejaVu-Sans-Bold \
  -pointsize 80 -gravity center -annotate +0+0 'md' /public/icon-192.png

# 512x512
convert -size 512x512 xc:'#2196F3' -fill white -font DejaVu-Sans-Bold \
  -pointsize 220 -gravity center -annotate +0+0 'md' /public/icon-512.png
```

**デザイン:**

- 青い背景（#2196F3）
- 白文字「md」
- シンプルで視認性が高い

#### 3. favicon

ブラウザタブ用の32×32アイコン：

```html
<link rel="icon" type="image/png" href="/favicon.png" />
```

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

### 仕様

- **オフライン動作**: 限定的（初回Pullが必須のため）
- **自動更新**: Service Workerは自動更新
- **プラットフォーム**: iOS Safari, Android Chrome, Desktop Chrome対応

---

## タイトルリンク化

### 概要

ヘッダーのタイトルをクリック可能なリンクに変更し、Ctrl+クリックや中クリックで別タブを開けるようにする機能。

### 実装

#### Before（ボタン）

```svelte
<button class="title-button" on:click={onTitleClick}>
  {title}
</button>
```

#### After（リンク）

```svelte
<a
  class="title-button"
  href="/"
  on:click={(e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      e.preventDefault()
      onTitleClick()
    }
  }}
>
  {title}
</a>
```

### 動作

| 操作                           | 動作                                       |
| ------------------------------ | ------------------------------------------ |
| **通常クリック**               | ホーム画面に遷移（既存動作）               |
| **Ctrl+クリック（Win/Linux）** | 新しいタブでホームを開く                   |
| **Cmd+クリック（Mac）**        | 新しいタブでホームを開く                   |
| **中クリック**                 | 新しいタブでホームを開く                   |
| **Shift+クリック**             | 新しいウィンドウでホームを開く             |
| **右クリック**                 | コンテキストメニュー（新しいタブで開く等） |

### CSS

リンクの下線を非表示：

```css
.title-button {
  text-decoration: none;
}
```

### ユースケース

- 複数タブでアプリを開く
- 左右のペインで別々のノートを開く
- ブラウザの「戻る」ボタンで履歴を辿る

---

## GitHub設定ヘルプアイコン

### 概要

GitHub設定の入力欄（リポジトリ名・トークン）に「？」アイコンを追加し、初心者向けに設定方法を画像で説明する機能。

### 実装

#### UIコンポーネント

```svelte
<div class="label-with-help">
  <label for="github-token">
    {$_('settings.github.token')} <span class="required">*</span>
  </label>
  <span class="help-icon" on:click={openTokenHelp} title="How to get GitHub token">
    <svg><!-- ?アイコン --></svg>
  </span>
</div>
```

#### モーダル表示

```svelte
{#if showTokenHelp}
  <div class="modal-overlay" on:click={closeTokenHelp}>
    <div class="modal-content" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{$_('settings.github.tokenHelp.title')}</h3>
        <button class="close-button" on:click={closeTokenHelp}>×</button>
      </div>
      <div class="modal-body">
        <img
          src="/assets/github-token-help.png"
          alt="How to create GitHub Personal Access Token"
          class="help-image"
        />
        <p class="help-description">
          {$_('settings.github.tokenHelp.description')}
        </p>
      </div>
    </div>
  </div>
{/if}
```

### デザイン

#### ヘルプアイコン

- **位置**: ラベルの右横
- **サイズ**: 18×18px
- **色**: アクセントカラー（opacity: 0.7）
- **ホバー**: opacity: 1、scale: 1.1

```css
.help-icon {
  display: inline-flex;
  color: var(--accent-color);
  opacity: 0.7;
  cursor: pointer;
  transition: all 0.2s;
}

.help-icon:hover {
  opacity: 1;
  transform: scale(1.1);
}
```

#### モーダル

- **背景**: 半透明黒（rgba(0, 0, 0, 0.7)）
- **コンテンツ**: 最大幅800px、角丸12px
- **画像**: 100%幅、角丸8px
- **閉じる**: ×ボタン（2rem、右上）

### 説明画像

#### リポジトリ名（github-repo-help.png）

- GitHubリポジトリのURL表示
- `username/repository-name` の形式を強調

#### トークン（github-token-help.png）

- GitHub → Settings → Developer settings
- Personal access tokens → Tokens (classic)
- Generate new token
- repo権限にチェック

**現状**: 仮画像（PLACEHOLDER）
**今後**: 実際のスクリーンショットに差し替え可能

### i18n対応

翻訳ファイルに追加：

```json
{
  "settings": {
    "github": {
      "repoHelp": {
        "title": "リポジトリ名の確認方法",
        "description": "GitHubでリポジトリを開き、URLから「ユーザー名/リポジトリ名」の形式で入力してください。"
      },
      "tokenHelp": {
        "title": "GitHub Personal Access Tokenの取得方法",
        "description": "上記の手順でGitHub Personal Access Tokenを取得できます。取得したトークンは大切に保管してください。"
      }
    }
  }
}
```

### 仕様

- **対象項目**: リポジトリ名、トークン
- **画像形式**: PNG
- **言語対応**: 全言語共通の1枚（矢印・囲みで説明）
- **モーダル**: 背景クリックで閉じる、Escキーは未対応
