# Agasteer - 開発者向けドキュメント

> Agasteerの技術仕様と開発ガイドです。

---

## 📚 ドキュメント目次

### 基本設計

| ファイル                             | 内容                                              |
| ------------------------------------ | ------------------------------------------------- |
| [architecture.md](./architecture.md) | アーキテクチャ概要、技術スタック、レイヤー構造    |
| [data-model.md](./data-model.md)     | TypeScript型定義、状態管理、CRUD操作パターン      |
| [storage.md](./storage.md)           | LocalStorage、IndexedDB、GitHub連携、テーマ       |
| [features.md](./features.md)         | エディタ（CodeMirror）、Vimモード、ナビゲーション |
| [content-sync.md](./content-sync.md) | リーフタイトルと#見出しの双方向同期               |

### UI機能 ([ui/](./ui/))

| ファイル                                  | 内容                                           |
| ----------------------------------------- | ---------------------------------------------- |
| [layout.md](./ui/layout.md)               | 2ペイン表示、レスポンシブ対応                  |
| [editor.md](./ui/editor.md)               | 罫線エディタモード                             |
| [customization.md](./ui/customization.md) | カスタムフォント、背景画像                     |
| [i18n.md](./ui/i18n.md)                   | 国際化（日本語・英語）                         |
| [badges.md](./ui/badges.md)               | バッジ機能（アイコン＋色）                     |
| [welcome-tour.md](./ui/welcome-tour.md)   | ウェルカムポップアップ、初回ガイド（吹き出し） |
| [misc.md](./ui/misc.md)                   | アプリアイコン、その他のUI改善                 |
| [share.md](./ui/share.md)                 | シェア機能（URL/Markdown/画像）                |
| [pwa.md](./ui/pwa.md)                     | PWA対応                                        |
| [links.md](./ui/links.md)                 | タイトルリンク化、GitHub設定ヘルプ             |

### プレビュー機能 ([preview/](./preview/))

| ファイル                                     | 内容                                         |
| -------------------------------------------- | -------------------------------------------- |
| [markdown.md](./preview/markdown.md)         | マークダウンプレビュー（marked + DOMPurify） |
| [scroll-sync.md](./preview/scroll-sync.md)   | 編集/プレビュー間のスクロール同期            |
| [image-export.md](./preview/image-export.md) | 画像ダウンロード・シェア（html2canvas）      |

### GitHub同期・データ保護 ([sync/](./sync/))

| ファイル                                        | 内容                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| [github-api.md](./sync/github-api.md)           | GitHub API統合（認証、ファイル操作、Tree API） |
| [push-pull.md](./sync/push-pull.md)             | Push/Pull処理フロー、回数カウント              |
| [dirty-tracking.md](./sync/dirty-tracking.md)   | 未保存変更の追跡、自動Push                     |
| [stale-detection.md](./sync/stale-detection.md) | Stale編集警告（同時編集対応）                  |

### 特殊リーフ ([special/](./special/))

| ファイル                             | 内容                                   |
| ------------------------------------ | -------------------------------------- |
| [priority.md](./special/priority.md) | Priorityリーフ（[1]〜[5]マーカー集約） |
| [offline.md](./special/offline.md)   | Offlineリーフ（ローカル専用）          |

### 開発・運用

| ファイル                             | 内容                                           |
| ------------------------------------ | ---------------------------------------------- |
| [development.md](./development.md)   | 開発ワークフロー、パフォーマンス、セキュリティ |
| [future-plans.md](./future-plans.md) | 拡張計画、既知の課題                           |

### 履歴 ([history/](./history/))

| ファイル                                   | 内容                             |
| ------------------------------------------ | -------------------------------- |
| [refactoring.md](./history/refactoring.md) | リファクタリング履歴（参考資料） |

---

## 🛠️ クイックリファレンス

### 開発コマンド

```bash
npm run dev          # 開発サーバー
npm run check        # 型チェック
npm run lint         # フォーマット + 型チェック
npm run build        # 本番ビルド
```

### 主要技術

| 技術       | バージョン | 役割                          |
| ---------- | ---------- | ----------------------------- |
| Svelte     | 5.55+      | UIフレームワーク（runes構文） |
| TypeScript | 5.7.2      | 型安全性                      |
| Vite       | 5.4+       | ビルドツール                  |
| CodeMirror | 6.0.1      | エディタ                      |
| marked     | 17+        | Markdown変換                  |

---

**Last Updated**: 2026-01-09
