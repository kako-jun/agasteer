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
