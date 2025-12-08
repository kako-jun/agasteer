# UI/UX機能

AgasteerのUI/UX関連機能の実装詳細について説明します。

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

## 罫線エディタモード

### 概要

エディタに罫線（横線）を表示して、紙のノートのような見た目にする機能。設定画面からオン/オフを切り替え可能。

### 設定

```typescript
interface Settings {
  // ...
  linedMode: boolean // 罫線モード（デフォルト: false）
}
```

### 技術実装

#### CodeMirror拡張

```typescript
import { lineNumbers } from '@codemirror/view'

// 罫線モード用のエディタ拡張を動的に追加
function getEditorExtensions(settings: Settings) {
  const extensions = [basicSetup, markdown()]

  if (settings.linedMode) {
    extensions.push(lineNumbers())
    extensions.push(linedModeTheme)
  }

  return extensions
}
```

#### CSS実装

```css
/* 罫線スタイル（ライトテーマ） */
.cm-editor.lined-mode .cm-line {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 2px;
}

/* 罫線スタイル（ダークテーマ） */
.dark .cm-editor.lined-mode .cm-line {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* 行番号 */
.cm-editor.lined-mode .cm-gutters {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}
```

### UI

設定画面に「罫線モード」トグルを配置（Vimモードの直上）。

```svelte
<LinedModeToggle {settings} {onSettingsChange} />
```

### 仕様

- **保存場所**: LocalStorage `Settings.linedMode`
- **デフォルト**: オフ
- **リアルタイム反映**: 設定変更後、即座にエディタに反映
- **行番号**: 罫線モード有効時に自動表示
- **テーマ対応**: ライト/ダークテーマで線色が自動調整

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

## システム等幅Webフォント

### 概要

エディタとcodeブロックに日本語CJK等幅フォント（BIZ UDGothic）を自動適用する機能。Linux環境など、ローカルに日本語等幅フォントがインストールされていない場合でも、美しい表示を実現します。

### 設計思想

| 機能                        | 適用範囲                                     | ユーザー操作     |
| --------------------------- | -------------------------------------------- | ---------------- |
| **システム等幅Webフォント** | エディタ + codeブロックのみ（`--font-mono`） | 自動（設定不要） |
| **カスタムフォント**        | アプリ全体（body, input, etc.）              | 手動アップロード |

カスタムフォントがアップロードされている場合は、カスタムフォントが優先されます。

### 技術実装

#### Google Fontsからのダウンロード

```typescript
const GOOGLE_FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=BIZ+UDGothic&display=swap'

async function fetchSystemMonoFontFromGoogle(): Promise<SystemMonoFont> {
  // 1. CSSからwoff2 URLを抽出
  const woff2Url = await extractWoff2UrlFromGoogleFonts(GOOGLE_FONTS_CSS_URL)

  // 2. woff2ファイルをダウンロード
  const response = await fetch(woff2Url)
  const arrayBuffer = await response.arrayBuffer()

  return {
    name: 'system-mono',
    data: arrayBuffer,
    type: 'font/woff2',
    version: '1.0',
  }
}
```

#### IndexedDBへのキャッシュ

```typescript
interface SystemMonoFont extends CustomFont {
  version: string // バージョン管理用
}

// 既存のfontsストアを再利用
await saveCustomFont(font) // キー: 'system-mono'
```

#### CSS変数への動的適用

```typescript
function applySystemMonoFont(font: CustomFont): void {
  const blob = new Blob([font.data], { type: font.type })
  const url = URL.createObjectURL(blob)

  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: 'SystemMonoFont';
      src: url(${url}) format('woff2');
    }

    :root {
      --font-mono: 'SystemMonoFont', 'Courier New', Menlo, Consolas, monospace;
    }
  `

  document.head.appendChild(style)
}
```

### 起動時の処理フロー

```
アプリ起動
    ↓
loadAndApplySystemMonoFont()
    ↓
IndexedDBに 'system-mono' キーで検索
    ↓
┌─ キャッシュあり & バージョン一致
│      ↓
│   IndexedDBから読み込んで適用
│
└─ キャッシュなし or バージョン不一致
       ↓
    Google Fontsからダウンロード
       ↓
    IndexedDBに保存
       ↓
    適用
```

### バージョン管理

```typescript
const SYSTEM_MONO_FONT_VERSION = '1.0'

// キャッシュ確認時にバージョンをチェック
if (cached && cached.version === SYSTEM_MONO_FONT_VERSION) {
  // キャッシュを使用
} else {
  // 再ダウンロード
}
```

フォントを変更する場合は `SYSTEM_MONO_FONT_VERSION` を上げるだけで、全ユーザーに新しいフォントが配信されます。

### 優先順位

エディタ部分のフォント適用優先順位：

1. **カスタムフォント**（`!important`で全体に適用）
2. **システム等幅Webフォント**（`--font-mono`に適用）
3. **CSSフォールバック**（`'Courier New', Menlo, Consolas, monospace`）

### 仕様

| 項目           | 内容                                                      |
| -------------- | --------------------------------------------------------- |
| **フォント**   | BIZ UDGothic（Google Fonts）                              |
| **サイズ**     | 約1.2MB（woff2圧縮）                                      |
| **保存場所**   | IndexedDB `fonts` ストア（キー: `system-mono`）           |
| **適用範囲**   | `--font-mono` CSS変数のみ                                 |
| **PWA対応**    | バージョンアップ時も再ダウンロード不要（IndexedDBは永続） |
| **オフライン** | キャッシュ済みなら動作可能                                |
| **エラー時**   | CSSフォールバックが使用される                             |

### メリット

- **ユーザー設定不要**: 初回起動時に自動ダウンロード
- **PWAフレンドリー**: Service Workerのキャッシュと異なり、IndexedDBは永続的
- **帯域効率**: 一度ダウンロードすれば再取得不要
- **Linux対応**: ローカルにCJKフォントがなくても美しい表示

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

## バッジ機能（アイコン＋色パレット）

### 概要

ノートとリーフのカード右上にバッジを表示する機能。アイコンと色を自由に組み合わせて視覚的に区別できます。

### データ構造

```typescript
interface Note {
  id: string
  name: string
  parentId: string | null
  order: number
  badgeIcon?: string // アイコン識別子（例: 'star', 'heart'）
  badgeColor?: string // カラーコード（例: '#ff6b6b'）
}

interface Leaf {
  id: string
  title: string
  content: string
  noteId: string
  order: number
  updatedAt: number
  badgeIcon?: string
  badgeColor?: string
}
```

### UI実装

#### バッジ表示

```svelte
<div class="card">
  <button class="badge" on:click={openBadgePicker}>
    {#if badgeIcon && badgeIcon !== '+'}
      <span class="badge-icon" style="color: {badgeColor}">{badgeIcon}</span>
    {:else}
      <span class="badge-plus">+</span>
    {/if}
  </button>
</div>
```

#### アイコン選択UI（5×5グリッド）

```svelte
<div class="icon-grid">
  {#each icons as icon}
    <button
      class="icon-option"
      class:selected={selectedIcon === icon}
      on:click={() => selectIcon(icon)}
    >
      {icon}
    </button>
  {/each}
</div>
```

利用可能なアイコン（25種類）:

- スター、ハート、チェック、フラグ、ブックマーク
- 電球、ピン、ベル、時計、カレンダー
- その他フォントアイコン

#### 色選択UI（5色パレット）

```svelte
<div class="color-palette">
  {#each colors as color}
    <button
      class="color-option"
      style="background-color: {color}"
      class:selected={selectedColor === color}
      on:click={() => selectColor(color)}
    />
  {/each}
</div>
```

カラーパレット:

- `#ff6b6b` (赤)
- `#ffd93d` (黄)
- `#6bcb77` (緑)
- `#4d96ff` (青)
- `#9b59b6` (紫)

### 保存先

- **IndexedDB**: ノート/リーフのフィールドとして保存
- **GitHub**: `metadata.json`内の各ノート/リーフエントリに保存

---

## ウェルカムポップアップ

### 概要

初回訪問時に表示されるウェルカムポップアップ。アプリの使い方を簡潔に紹介し、ユーザーがスムーズに開始できるようサポートします。

### 機能

- **言語自動検出**: ブラウザ/OSの言語設定に基づいて日本語/英語で表示
- **レスポンシブ対応**: スマートフォンなど狭い画面ではボタンが縦並びに配置
- **初回のみ表示**: LocalStorageで表示済みフラグを管理

### レスポンシブ実装

```css
.welcome-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* 狭い画面ではボタンを縦配置 */
@media (max-width: 480px) {
  .welcome-buttons {
    flex-direction: column;
  }

  .welcome-buttons button {
    width: 100%;
  }
}
```

### i18n対応

```json
{
  "welcome": {
    "title": "Agasteerへようこそ",
    "description": "シンプルなMarkdownノートアプリ",
    "getStarted": "始める",
    "learnMore": "詳しく見る"
  }
}
```

---

## アプリアイコン（テーマカラー対応）

### 概要

ヘッダーのアプリタイトル左側にアプリアイコンを表示する機能。アイコンの色はテーマのアクセントカラーに応じて動的に変更されます。

### 表示条件

- **デフォルトタイトル時のみ表示**: ユーザーがツール名を変更していない場合のみ表示
- **タイトル変更後は非表示**: カスタムツール名を設定した場合はアイコンを非表示

### 技術実装

#### AppIconコンポーネント

```svelte
<!-- src/components/AppIcon.svelte -->
<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
</script>

<svg width={size} height={size} viewBox="0 0 100 100" fill={color}>
  <!-- SVGパス -->
</svg>
```

#### 条件付き表示

```svelte
<script>
  import AppIcon from './AppIcon.svelte'
  import { DEFAULT_SETTINGS } from '../lib/types'

  $: isDefaultTitle = settings.toolName === DEFAULT_SETTINGS.toolName
</script>

<header>
  {#if isDefaultTitle}
    <AppIcon color="var(--accent-color)" />
  {/if}
  <span class="title">{settings.toolName}</span>
</header>
```

### デザイン

- **サイズ**: 24x24px
- **色**: `var(--accent-color)` - テーマのアクセントカラー
- **位置**: アプリタイトルの左側
- **間隔**: タイトルとの間に0.5rem

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

### 統計パネル（StatsPanel）

ホーム画面右下にリーフ数・文字数・Push回数を表示するコンポーネント。

#### StatsPanelコンポーネント

```svelte
<!-- src/components/StatsPanel.svelte -->
<script lang="ts">
  import { leaves, metadata } from '../lib/stores'
  import { totalCharCount } from '../lib/stores'

  $: leafCount = $leaves.length
  $: charCount = $totalCharCount
  $: pushCount = $metadata.pushCount
</script>

<div class="stats-panel">
  <div class="stat-item">
    <span class="stat-label">リーフ数</span>
    <span class="stat-value">{leafCount.toLocaleString()}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">文字数</span>
    <span class="stat-value">{charCount.toLocaleString()}</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">Push回数</span>
    <span class="stat-value">{pushCount.toLocaleString()}</span>
  </div>
</div>
```

#### 文字数キャッシュ

パフォーマンス最適化のため、文字数は個別にキャッシュし、差分更新します。

```typescript
// totalCharCountストア
export const totalCharCount = writable<number>(0)

// リーフの作成/更新/削除/Pull時に差分更新
export function updateTotalCharCount(leaves: Leaf[]): void {
  const total = leaves.reduce((sum, leaf) => sum + leaf.content.length, 0)
  totalCharCount.set(total)
}
```

#### スタイル

```css
.stats-panel {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 0; /* カードの背面 */
  opacity: 0.5;
  pointer-events: none;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--accent-color);
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
    name: 'Agasteer',
    short_name: 'Agasteer',
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

---

## Priorityリーフ（優先段落の集約）

### 概要

複数のリーフに散らばった優先度付き段落を1つの仮想リーフにまとめて表示する機能。`[n]` マーカー（nは数字）付きの段落を全リーフから抽出し、優先度順にソートして表示します。

### データ構造

#### PriorityItem

```typescript
interface PriorityItem {
  /** 優先度（数字、小さいほど優先） */
  priority: number
  /** 段落のテキスト内容 */
  content: string
  /** 元のリーフID */
  leafId: string
  /** 元のリーフタイトル */
  leafTitle: string
  /** 元のノートID */
  noteId: string
  /** 元のノート名 */
  noteName: string
  /** 表示順序（ノート順 + リーフ順） */
  displayOrder: number
}
```

#### 仮想リーフ

```typescript
const PRIORITY_LEAF_ID = '__priority__'
const PRIORITY_LEAF_NAME = 'Priority'

function createPriorityLeaf(items: PriorityItem[]): Leaf {
  return {
    id: PRIORITY_LEAF_ID,
    title: PRIORITY_LEAF_NAME,
    noteId: '', // 空文字 = ホーム直下
    content: generatePriorityContent(items),
    updatedAt: Date.now(),
    order: 0,
  }
}
```

### マーカー検出ロジック

#### 抽出条件

- **先頭パターン**: 段落の先頭行が `[n] ` で始まる（後ろにスペース必須）
- **末尾パターン**: 段落の最終行が ` [n]` で終わる（前にスペース必須）

```typescript
function extractPriority(paragraph: string): number | null {
  const lines = paragraph.split('\n')
  const firstLine = lines[0]
  const lastLine = lines[lines.length - 1]

  // 先頭行の左端が [n] で始まり、その後にスペースがある場合
  const startMatch = firstLine.match(/^\[(\d+)\] /)
  if (startMatch) {
    return parseInt(startMatch[1], 10)
  }

  // 最後行の右端が [n] で終わり、その前にスペースがある場合
  const endMatch = lastLine.match(/ \[(\d+)\]$/)
  if (endMatch) {
    return parseInt(endMatch[1], 10)
  }

  return null
}
```

#### スペース必須の理由

誤マッチを防ぐため：

- `array[0]` → 配列の添え字（マッチしない）
- `テキスト[1]` → 参考文献番号（マッチしない）
- `[1] タスク` → 優先マーカー（マッチする）
- `タスク [2]` → 優先マーカー（マッチする）

### ソートロジック

```typescript
items.sort((a, b) => {
  // 1. 優先度（数字昇順）
  if (a.priority !== b.priority) {
    return a.priority - b.priority
  }
  // 2. 同じ優先度は表示順（ノート順 * 10000 + リーフ順）
  return a.displayOrder - b.displayOrder
})
```

### 保存対象の判定

#### 設計思想

このアプリはホーム直下にノートのみ許可し、リーフは許可しない仕様。そのため、ホーム直下のリーフ（noteIdが実際のノートに存在しない）は保存対象外とする汎用的なロジックで実装。

```typescript
/**
 * リーフがGit保存対象かどうかを判定
 */
function isLeafSaveable(leaf: Leaf, allNotes: Note[]): boolean {
  return allNotes.some((n) => n.id === leaf.noteId)
}

/**
 * ノートがGit保存対象かどうかを判定
 */
function isNoteSaveable(note: Note): boolean {
  return !note.id.startsWith('__')
}
```

#### 使用箇所

1. **Push時のフィルタリング** (`App.svelte`)

```typescript
const saveableNotes = $notes.filter((n) => isNoteSaveable(n))
const saveableLeaves = $leaves.filter((l) => isLeafSaveable(l, saveableNotes))
```

2. **統計計算時のフィルタリング** (`App.svelte`)

```typescript
function rebuildLeafStats(allLeaves: Leaf[], allNotes: Note[]) {
  for (const leaf of allLeaves) {
    if (!isLeafSaveable(leaf, allNotes)) continue
    // リーフ数・文字数をカウント
  }
}
```

3. **パンくずリストの表示** (`breadcrumbs.ts`)

```typescript
if (note && isNoteSaveable(note)) {
  // 実際のノートのみパンくずに表示
}
```

### UI実装

#### HomeView.svelte での表示

Priorityリーフは通常のリーフカードと同じ見た目で、常に先頭に表示：

```svelte
<div class="card-grid">
  <!-- Priority リーフ: 常に先頭に表示 -->
  {#if priorityLeaf}
    <div
      class="leaf-card"
      class:selected={vimMode && isActive && selectedIndex === 0}
      on:click={onSelectPriority}
    >
      <BadgeButton
        icon={priorityLeaf.badgeIcon || ''}
        color={priorityLeaf.badgeColor || ''}
        onChange={(icon, color) => onUpdatePriorityBadge(icon, color)}
      />
      <strong>{priorityLeaf.title}</strong>
      <div class="card-meta">
        <small class="leaf-stats">
          {formatLeafStats(priorityLeaf.content)}
        </small>
        <small class="leaf-updated">
          {formatDateTime(priorityLeaf.updatedAt, 'short')}
        </small>
      </div>
    </div>
  {/if}

  <!-- 通常のノート一覧 -->
  {#each notes as note}
    <NoteCard {note} ... />
  {/each}
</div>
```

#### ナビゲーション

```typescript
function openPriorityView(pane: Pane) {
  const items = get(priorityItems)
  const priorityLeaf = createPriorityLeaf(items)

  if (pane === 'left') {
    leftNote = null // ホーム直下なのでnull
    leftLeaf = priorityLeaf
    leftView = 'preview' // 読み取り専用
  } else {
    rightNote = null
    rightLeaf = priorityLeaf
    rightView = 'preview'
  }
}
```

### リアルタイム更新

Svelte derived storeを使用して、リーフの変更を自動的に反映：

```typescript
export const priorityItems = derived([leaves, notes], ([$leaves, $notes]) => {
  const items: PriorityItem[] = []

  for (const leaf of $leaves) {
    const noteName = getNoteName(leaf.noteId, $notes)
    const displayOrder = getNoteDisplayOrder(leaf.noteId, $notes) * 10000 + leaf.order
    const extracted = extractPriorityItems(leaf, noteName, displayOrder)
    items.push(...extracted)
  }

  items.sort(/* 優先度順 → 表示順 */)
  return items
})
```

### 生成されるMarkdownコンテンツ

```typescript
function generatePriorityContent(items: PriorityItem[]): string {
  if (items.length === 0) {
    return `# Priority\n\n_No priority items found._\n_Add markers like "[1] " at the start or " [2]" at the end of paragraphs._`
  }

  const lines: string[] = ['# Priority', '']

  for (const item of items) {
    // 優先度バッジ + 内容
    lines.push(`**[${item.priority}]** ${item.content}`)
    // 出典（リーフ名 @ ノート名）
    lines.push(`_— ${item.leafTitle} @ ${item.noteName}_`)
    lines.push('')
  }

  return lines.join('\n')
}
```

出力例：

```markdown
# Priority

**[1]** 最優先で対応すべきタスク
_— タスク管理 @ 仕事ノート_

**[2]** 重要な作業項目
_— 週次レビュー @ プロジェクトA_

**[3]** 今週中に完了させる
_— TODO @ 個人メモ_
```

### 仕様まとめ

| 項目               | 内容                             |
| ------------------ | -------------------------------- |
| **リーフID**       | `__priority__`                   |
| **リーフ名**       | `Priority`                       |
| **noteId**         | 空文字（ホーム直下）             |
| **保存**           | Git保存対象外（仮想リーフ）      |
| **統計**           | リーフ数・文字数に含めない       |
| **表示位置**       | ホーム画面の先頭                 |
| **表示モード**     | プレビューのみ（読み取り専用）   |
| **バッジ**         | 設定可能（ただし永続化されない） |
| **更新タイミング** | リーフ変更時に自動更新           |

### ファイル構成

```
src/lib/priority.ts
├── extractPriority()          # マーカー検出
├── removePriorityMarker()     # マーカー除去
├── extractPriorityItems()     # リーフから優先段落を抽出
├── priorityItems              # derived store
├── generatePriorityContent()  # Markdown生成
├── createPriorityLeaf()       # 仮想リーフ生成
├── isPriorityLeaf()           # リーフID判定
├── isLeafSaveable()           # 保存対象判定（リーフ）
└── isNoteSaveable()           # 保存対象判定（ノート）
```
