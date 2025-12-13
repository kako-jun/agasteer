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

### PWA更新フロー

新しいバージョンがデプロイされた場合、初回Pullより先に更新を適用します。これにより、API制限の節約と古いコードでのPull実行を回避できます。

#### 実装（main.ts）

```typescript
import { registerSW } from 'virtual:pwa-register'

// PWA更新を初回Pullより先にチェック
// 新しいSWがあれば即座にリロード（API制限の節約）
const updateSW = registerSW({
  immediate: true,
  onRegistered(swRegistration) {
    swRegistration?.update()
  },
  onNeedRefresh() {
    // 新しいSWが検知された場合、即座にリロード
    // これにより、App.svelteのonMountでの初回Pullより先に更新が適用される
    console.log('New version available, reloading...')
    updateSW(true) // true = immediate reload
  },
})
```

#### フロー

```
アプリ起動
    ↓
main.ts: registerSW (immediate: true) → waitForSwCheckをexport
    ↓
App.svelte onMount
    ↓
await waitForSwCheck ← ここでSWチェック完了を待つ
    ↓
    ├─ 新しいSWあり → onNeedRefresh → 即座にリロード（Pullなし）
    │                    ↓
    │               リロード後に再起動 → 新しいコードでPull実行
    │
    └─ 新しいSWなし or タイムアウト(500ms) → handlePull(true)
```

#### 実装（App.svelte）

```typescript
import { waitForSwCheck } from './main'

onMount(() => {
  ;(async () => {
    // ... 初期化処理 ...

    // PWA更新チェック完了を待つ（更新があればリロードされる）
    await waitForSwCheck

    // GitHub設定チェック → handlePull(true)
  })()
})
```

**設計のポイント:**

- `waitForSwCheck`: main.tsからexportされるPromise
- App.svelteで`await`することで、SWチェック完了を確実に待つ
- タイムアウト500ms: SWがサポートされていない環境でも動作
- 更新があればリロードされ、Pullは走らない

### 仕様

- **オフライン動作**: 限定的（初回Pullが必須のため）
- **自動更新**: Service Workerは自動更新、新バージョン検知で即座にリロード
- **プラットフォーム**: iOS Safari, Android Chrome, Desktop Chrome対応

---
