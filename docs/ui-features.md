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
