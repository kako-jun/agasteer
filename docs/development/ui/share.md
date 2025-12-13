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
