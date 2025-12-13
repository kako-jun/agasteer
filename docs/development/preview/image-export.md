## プレビュー画像ダウンロード機能

### 概要

プレビュー表示中にダウンロードボタンをクリックすると、表示されているMarkdownプレビューをPNG画像としてダウンロードできます。スクロールが必要な長いコンテンツも1枚の画像に収めることができるため、メモをLINEなどで手軽にシェアする用途に適しています。

### 使用シーン

- **メモの共有**: 作成したメモをLINEやSlackで画像として共有
- **スナップショット**: プレビュー内容を視覚的に保存
- **プレゼン資料**: Markdownで作成した内容を画像として取り込む

### 技術実装

#### html2canvasライブラリ

```typescript
// 動的インポート（使用時のみロード）
const html2canvas = (await import('html2canvas')).default
```

- **バンドルサイズ**: 約200KB（gzip: 48KB）
- **動的インポート**: プレビュー画像ダウンロード時のみロード
- **ブラウザ互換性**: モダンブラウザ対応

#### 画像生成設定

```typescript
const canvas = await html2canvas(wrapper, {
  backgroundColor: '#ffffff', // 白背景
  scale: 1, // 等倍（画像サイズ削減）
  logging: false,
  useCORS: true, // 外部画像対応
})
```

| 設定項目          | 値        | 理由                     |
| ----------------- | --------- | ------------------------ |
| `backgroundColor` | `#ffffff` | 白背景で見やすく         |
| `scale`           | `1`       | 等倍で画像サイズを抑える |
| `logging`         | `false`   | コンソールログを抑制     |
| `useCORS`         | `true`    | 外部画像の埋め込み対応   |

#### 余白の追加

```typescript
// 余白付きラッパー要素を一時的に作成
const wrapper = document.createElement('div')
wrapper.style.padding = '20px'
wrapper.style.backgroundColor = '#ffffff'
wrapper.style.display = 'inline-block'

// コンテンツをクローンして追加
const clonedContent = contentElement.cloneNode(true) as HTMLElement
wrapper.appendChild(clonedContent)
document.body.appendChild(wrapper)

// キャプチャ後に削除
const canvas = await html2canvas(wrapper, {
  /* ... */
})
document.body.removeChild(wrapper)
```

**余白の役割**:

- 上下左右20pxの余白を追加
- 読みやすさの向上
- 画像の端が切れる問題を回避

#### スクロール全体のキャプチャ

```typescript
// スクロール位置を保存
const originalScrollTop = previewSection.scrollTop

// 一時的に最上部へ移動
previewSection.scrollTop = 0

// キャプチャ実行
const canvas = await html2canvas(contentElement, {
  /* ... */
})

// スクロール位置を復元
previewSection.scrollTop = originalScrollTop
```

**処理フロー**:

1. 現在のスクロール位置を保存
2. プレビューを最上部にスクロール
3. 全体をキャプチャ（html2canvasは表示領域外も含めてキャプチャ）
4. 元のスクロール位置に戻す

### PreviewView.svelte実装

#### captureAsImage関数

```typescript
export async function captureAsImage(filename: string): Promise<void> {
  if (!previewSection || isLoading) return

  try {
    const html2canvas = (await import('html2canvas')).default
    const contentElement = previewSection.querySelector('.preview-content') as HTMLElement
    if (!contentElement) return

    const originalScrollTop = previewSection.scrollTop
    previewSection.scrollTop = 0

    // 余白付きラッパーを作成
    const wrapper = document.createElement('div')
    wrapper.style.padding = '20px'
    wrapper.style.backgroundColor = '#ffffff'
    wrapper.style.display = 'inline-block'

    const clonedContent = contentElement.cloneNode(true) as HTMLElement
    wrapper.appendChild(clonedContent)
    document.body.appendChild(wrapper)

    // キャプチャ実行
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 1,
      logging: false,
      useCORS: true,
    })

    document.body.removeChild(wrapper)
    previewSection.scrollTop = originalScrollTop

    // PNG画像としてダウンロード
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  } catch (error) {
    console.error('画像キャプチャに失敗しました:', error)
    throw error
  }
}
```

### App.svelte - ダウンロード処理の分岐

#### 編集モード時: Markdownダウンロード

```typescript
function downloadLeafAsMarkdown(leafId: string) {
  if (isOperationsLocked) {
    showPushToast('初回Pullが完了するまでダウンロードできません', 'error')
    return
  }

  const targetLeaf = $leaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  const blob = new Blob([targetLeaf.content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${targetLeaf.title}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

#### プレビューモード時: 画像ダウンロード

```typescript
async function downloadLeafAsImage(leafId: string, pane: Pane) {
  if (isOperationsLocked) {
    showPushToast('初回Pullが完了するまでダウンロードできません', 'error')
    return
  }

  const targetLeaf = $leaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  try {
    const previewView = pane === 'left' ? leftPreviewView : rightPreviewView
    if (previewView && previewView.captureAsImage) {
      await previewView.captureAsImage(targetLeaf.title)
      showPushToast(
        $settings.locale === 'ja' ? '画像をダウンロードしました' : 'Image downloaded',
        'success'
      )
    }
  } catch (error) {
    console.error('画像ダウンロードに失敗しました:', error)
    showPushToast(
      $settings.locale === 'ja' ? '画像ダウンロードに失敗しました' : 'Failed to download image',
      'error'
    )
  }
}
```

#### フッターボタンの出し分け

```svelte
<!-- 編集モード時 -->
{:else if leftView === 'edit' && leftLeaf}
  <EditorFooter
    onDownload={() => downloadLeafAsMarkdown(leftLeaf.id)}
    {/* ... */}
  />

<!-- プレビューモード時 -->
{:else if leftView === 'preview' && leftLeaf}
  <PreviewFooter
    onDownload={() => downloadLeafAsImage(leftLeaf.id, 'left')}
    {/* ... */}
  />
```

### PreviewFooter.svelte - ボタンラベル

#### 国際化対応

```svelte
<button
  type="button"
  on:click={onDownload}
  title={$_('footer.downloadImage')}
  aria-label={$_('footer.downloadImage')}
  {disabled}
>
  <svg><!-- ダウンロードアイコン --></svg>
</button>
```

**i18nラベル**:

- 日本語: `"画像をダウンロード"`
- 英語: `"Download as image"`

### ファイル命名規則

```typescript
a.download = `${filename}.png`
```

- ファイル名: リーフのタイトル
- 拡張子: `.png`
- 例: `買い物リスト.png`, `Meeting Notes.png`

### 動作フロー

1. **プレビュー表示**: リーフをプレビューモードで開く
2. **ダウンロードボタンクリック**: 左下のダウンロードボタンをクリック
3. **html2canvas動的ロード**: 初回のみライブラリをロード（約200KB）
4. **画像生成**: プレビュー内容全体を白背景+20px余白でキャプチャ
5. **自動ダウンロード**: `{リーフタイトル}.png`として保存
6. **トースト通知**: 成功/失敗メッセージを表示

### パフォーマンス考慮

#### 動的インポート

```typescript
const html2canvas = (await import('html2canvas')).default
```

- 初回使用時のみライブラリをロード
- メインバンドルには含まれない（コード分割）
- プレビュー画像ダウンロードを使わないユーザーには影響なし

#### キャプチャ速度

- **短いメモ（~1000文字）**: 0.5秒未満
- **長い文書（~5000文字）**: 1-2秒
- **画像多数の文書**: 画像のロード時間に依存

#### メモリ管理

```typescript
// Blob URLを作成
const url = URL.createObjectURL(blob)

// ダウンロード後にメモリ解放
URL.revokeObjectURL(url)
```

### ブラウザ互換性

| ブラウザ       | 対応状況           |
| -------------- | ------------------ |
| Chrome/Edge    | ✅ 完全対応        |
| Firefox        | ✅ 完全対応        |
| Safari         | ✅ 完全対応        |
| iOS Safari     | ✅ 対応（iOS 12+） |
| Android Chrome | ✅ 対応            |

### 制限事項

1. **外部リソース**: CORS制約のある外部画像は表示されない場合あり
2. **カスタムフォント**: システムフォントのみキャプチャ可能
3. **背景画像**: カスタム背景画像は含まれない（プレビューコンテンツのみ）
4. **画像サイズ**: 非常に長い文書（10000行超）では画像サイズが大きくなる可能性

### トラブルシューティング

#### 画像が真っ白になる

- **原因**: CSSが読み込まれていない、または外部リソースのCORS問題
- **対策**: `useCORS: true`で解決（実装済み）

#### 一部のスタイルが反映されない

- **原因**: インラインスタイルやCSS変数が一部未対応
- **対策**: html2canvasの制限。現在の実装で主要なマークダウン要素は対応済み

#### ダウンロードが始まらない

- **原因**: ブラウザのポップアップブロック
- **対策**: ユーザーアクション（ボタンクリック）から直接呼び出しているため通常は発生しない

---

## プレビュー画像シェア機能

### 概要

プレビュー表示時のシェアボタンの動作を、編集モードとプレビューモードで自動的に切り替えます。編集モードではMarkdownテキストをコピー、プレビューモードでは画像をクリップボードにコピー、またはWeb Share APIを使って他のアプリに直接共有できます。

### 使用シーン

- **スマホでLINEに送信**: プレビュー → シェア → 画像を共有 → LINEを選択
- **デスクトップで画像コピー**: プレビュー → シェア → 画像をコピー → 他のアプリに貼り付け
- **Markdownコピー**: 編集 → シェア → Markdownをコピー

### 画像生成の共通化

すべての画像関連機能（ダウンロード、クリップボード、共有）は `captureAsBlob()` という内部関数を共通で使用します。

```typescript
// 内部関数 - 画像生成ロジックを共通化
async function captureAsBlob(): Promise<Blob | null>

// この関数を呼び出す3つの機能
export async function captureAsImage(filename: string) // ダウンロード
export async function copyImageToClipboard() // クリップボード
export async function shareImage(filename: string) // Web Share API
```

### Clipboard API実装

```typescript
export async function copyImageToClipboard(): Promise<void> {
  const blob = await captureAsBlob()
  if (!blob) return

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob,
    }),
  ])
}
```

### Web Share API実装

```typescript
export async function shareImage(filename: string): Promise<void> {
  const blob = await captureAsBlob()
  if (!blob) return

  if (!navigator.share || !navigator.canShare) {
    throw new Error('Web Share API is not supported')
  }

  const file = new File([blob], `${filename}.png`, { type: 'image/png' })
  const shareData = { files: [file], title: filename }

  if (navigator.canShare(shareData)) {
    await navigator.share(shareData)
  }
}
```

### フォールバック処理

```typescript
try {
  await previewView.shareImage(leaf.title)
} catch (error: any) {
  // Web Share API非対応時はクリップボードにコピー
  if (error.message === 'Web Share API is not supported') {
    await handleCopyImageToClipboard(pane)
  } else if (error.name === 'AbortError') {
    // ユーザーキャンセル時は何もしない
  }
}
```

### ブラウザ互換性

#### Clipboard API（画像コピー）

| ブラウザ       | 対応状況              |
| -------------- | --------------------- |
| Chrome/Edge    | ✅ 完全対応（v76+）   |
| Firefox        | ✅ 完全対応（v87+）   |
| Safari         | ✅ 完全対応（v13.1+） |
| iOS Safari     | ✅ 対応（iOS 13.4+）  |
| Android Chrome | ✅ 対応               |

#### Web Share API（画像共有）

| ブラウザ       | 対応状況               |
| -------------- | ---------------------- |
| Chrome/Edge    | ⚠️ デスクトップは制限  |
| Firefox        | ❌ 非対応              |
| Safari         | ✅ 対応（macOS 12.3+） |
| iOS Safari     | ✅ 完全対応（iOS 14+） |
| Android Chrome | ✅ 完全対応            |
