# 開発ガイド

SimplestNote.mdの開発ワークフロー、パフォーマンス最適化、セキュリティ、トラブルシューティングについて説明します。

## 開発ワークフロー

### ローカル開発

```bash
# 開発サーバー起動
npm run dev

# 別ターミナルで型チェック（ウォッチモード）
npm run check -- --watch
```

### コード品質チェック

```bash
# フォーマットチェック
npm run format:check

# 型チェック
npm run check

# 両方実行
npm run lint
```

### ビルド

```bash
# 本番ビルド
npm run build

# ビルド結果を確認
npm run preview
```

### デプロイ

`main`ブランチへのプッシュで自動デプロイ（GitHub Actions）。

```bash
git add .
git commit -m "feat: add search functionality"
git push origin main
```

### デバッグ

#### LocalStorageの確認

```javascript
// ブラウザコンソールで実行
console.log('Settings:', localStorage.getItem('simplest-md-note/settings'))
console.log('Folders:', localStorage.getItem('simplest-md-note/folders'))
console.log('Notes:', localStorage.getItem('simplest-md-note/notes'))
```

#### LocalStorageのリセット

```javascript
localStorage.removeItem('simplest-md-note/settings')
localStorage.removeItem('simplest-md-note/folders')
localStorage.removeItem('simplest-md-note/notes')
location.reload()
```

---

## パフォーマンス最適化

### 実装済みの最適化（2025-11-24）

1. **CodeMirrorの遅延ロード**
   - エディタを開くまでCodeMirror（約600 KB）を読み込まない
   - 動的インポートで必要な時だけロード

   ```typescript
   // MarkdownEditor.svelte
   async function loadCodeMirror() {
     const [
       { EditorState: ES },
       { EditorView: EV, keymap: km },
       { defaultKeymap: dk, history: h, historyKeymap: hk },
       { markdown: md },
       { basicSetup: bs },
     ] = await Promise.all([
       import('@codemirror/state'),
       import('@codemirror/view'),
       import('@codemirror/commands'),
       import('@codemirror/lang-markdown'),
       import('codemirror'),
     ])
   }
   ```

2. **marked/DOMPurifyの遅延ロード**
   - プレビューを開くまでmarkdown-tools（約64 KB）を読み込まない
   - 動的インポートで必要な時だけロード

   ```typescript
   // PreviewView.svelte
   async function loadMarkdownTools() {
     const [{ marked: m }, DOMPurifyModule] = await Promise.all([
       import('marked'),
       import('dompurify'),
     ])
   }
   ```

3. **Viteのマニュアルチャンク設定**
   - CodeMirror関連を独立チャンクに分離
   - marked/DOMPurifyを独立チャンクに分離
   - svelte-i18nを独立チャンクに分離
   - ベンダーライブラリのキャッシュ効率を向上

   ```typescript
   // vite.config.ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'codemirror': ['codemirror', '@codemirror/view', '@codemirror/state', ...],
           'markdown-tools': ['marked', 'dompurify'],
           'i18n': ['svelte-i18n'],
         },
       },
     },
   }
   ```

4. **PWA対応（Service Worker）**
   - vite-plugin-pwaによるService Worker自動生成
   - 静的アセットのプリキャッシュ
   - GitHub API（5分間）のランタイムキャッシュ
   - オフライン基本動作のサポート

   ```typescript
   // vite.config.ts
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
             expiration: { maxAgeSeconds: 300 },
           },
         },
       ],
     },
   })
   ```

5. **最適化効果**
   - ホーム画面初回読み込み：278.78 KB → 33.94 KB（gzip）**87.8%削減**
   - エディタ使用時：242.97 KB（gzip）**12.9%削減**
   - プレビュー使用時：55.38 KB（gzip）**80.1%削減**
   - 2回目以降：PWAキャッシュでほぼ瞬時に起動

### 現在の考慮事項

1. **リアクティブ宣言の最適化**
   - Svelteが自動的に依存関係を追跡
   - 不要な再計算を防ぐ

2. **イミュータブル更新**

   ```typescript
   // ❌ ミュータブル（Svelteが変更を検知しない）
   folders.push(newFolder)

   // ✅ イミュータブル（検知される）
   folders = [...folders, newFolder]
   ```

3. **LocalStorageの書き込み最小化**
   - 変更時のみ`persist*()`を呼び出し
   - デバウンスは不要（変更頻度が低い）

### 将来的な最適化

1. **仮想スクロール**
   - ノートが1000件以上になった場合
   - `svelte-virtual`等のライブラリ使用

2. **Web Workers**
   - 全文検索処理をバックグラウンド化
   - 大量ノートのインデックス作成

---

## セキュリティ考慮事項

### 現在の実装

1. **トークン保存**
   - LocalStorageにクリアテキストで保存
   - ⚠️ XSS攻撃に対して脆弱
   - 推奨: 信頼できる端末でのみ使用

2. **HTTPS通信**
   - GitHub APIへの通信は暗号化
   - トークンはHTTPSヘッダーで送信

3. **CORS**
   - GitHub APIがCORSを許可しているため直接呼び出し可能

### 改善提案

1. **トークンの暗号化**

   ```typescript
   import { AES, enc } from 'crypto-js'

   function encryptToken(token: string, passphrase: string): string {
     return AES.encrypt(token, passphrase).toString()
   }

   function decryptToken(encrypted: string, passphrase: string): string {
     return AES.decrypt(encrypted, passphrase).toString(enc.Utf8)
   }
   ```

2. **トークンの有効期限管理**
   - 設定にexpiration dateを保存
   - 期限切れ時にアラート表示

3. **Content Security Policy**
   ```html
   <!-- index.html -->
   <meta
     http-equiv="Content-Security-Policy"
     content="default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com;"
   />
   ```

---

## トラブルシューティング

### よくある問題

#### 1. GitHub同期エラー

**症状**: 「同期エラー」メッセージが表示される

**原因と対策**:

- トークンの権限不足 → `repo`スコープを確認
- トークンの有効期限切れ → 新しいトークンを生成
- リポジトリ名の誤り → `owner/repo`形式を確認
- ネットワークエラー → インターネット接続を確認

#### 2. エディタが表示されない

**症状**: ノートを開いても編集画面が空白

**原因と対策**:

- `editorContainer`がnull → DOMのマウント順序を確認
- CodeMirrorの初期化失敗 → コンソールエラーを確認

#### 3. データが消えた

**症状**: 保存したノートやフォルダが表示されない

**原因と対策**:

- ブラウザのキャッシュクリア → GitHubから復元（将来実装予定）
- 別のブラウザ/プロファイル → LocalStorageはブラウザ固有
- シークレットモード → 通常モードでアクセス

### 解決済みの問題

#### GitHub APIキャッシュ問題（2025-01-23に解決）

**症状**: Push直後にPullしても変更が反映されない

**原因**:

GitHub Contents APIがレスポンスをキャッシュするため、Push直後のPullで古いデータが返される。

**発見経緯**:

Push回数カウント機能の実装中に、Push直後にPullしても`pushCount`が更新されない現象を発見。この機能がなければ潜在的な問題として見過ごされていた可能性が高い。

**解決策**:

`fetchGitHubContents`ヘルパー関数を作成し、すべてのContents API呼び出しにキャッシュバスター（タイムスタンプ）を付与：

```typescript
async function fetchGitHubContents(path: string, repoName: string, token: string) {
  const url = `https://api.github.com/repos/${repoName}/contents/${path}?t=${Date.now()}`
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
```

**影響範囲**:

- metadata.jsonの取得
- リーフコンテンツの取得
- ファイルSHAの取得

**効果**:

- ✅ Push直後のPullでも最新データを取得
- ✅ 複数デバイス間の同期が正確に
- ✅ データの上書き・喪失リスクを排除

---

## まとめ

SimplestNote.mdは、シンプルさを追求した軽量Markdownノートアプリです。単一ファイルアーキテクチャにより、小規模プロジェクトとして理解しやすく、カスタマイズも容易です。

### 主要な技術的特徴

- **Svelteのリアクティブシステム**: 宣言的な状態管理
- **LocalStorage永続化**: サーバーレスでのデータ保存
- **GitHub API直接統合**: 外部サービス不要の同期
- **CodeMirror 6**: モダンで拡張性の高いエディタ
- **CSS変数テーマ**: 柔軟なスタイリングシステム

### 今後の方向性

実装されたリファクタリングにより、以下が実現可能になりました：

1. **保守性の向上**: ✅ コンポーネント分割、ストア導入（実装済み）
2. **テスタビリティ**: ユニットテスト、E2Eテストの追加（今後の課題）
3. **拡張性**: プラグインシステム、ルーティング（検討中）
4. **機能追加**: 検索、双方向同期、履歴管理（今後の機能）

このドキュメントが、SimplestNote.mdの理解と今後の開発に役立つことを願っています。
