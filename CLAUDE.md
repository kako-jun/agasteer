# Agasteer - 開発者向けドキュメント

> 詳細なドキュメントは[docs/](./docs/)ディレクトリに配置されています。

---

## 📚 ドキュメント目次

### ユーザー向け

- **[ユーザーガイド](./docs/user-guide/ja/index.md)** - 使い方、カスタマイズ、FAQ

### 開発者向け

- **[開発者向けドキュメント](./docs/development/index.md)** - 技術仕様と開発ガイド
  - [アーキテクチャ](./docs/development/architecture.md) - 設計哲学、技術スタック
  - [データモデル](./docs/development/data-model.md) - 型定義、状態管理
  - [ストレージ](./docs/development/storage.md) - LocalStorage、IndexedDB
  - [基本機能](./docs/development/features.md) - エディタ、Vim、ナビゲーション
  - [拡張計画](./docs/development/future-plans.md) - 今後の実装予定、既知の課題

---

## 🔧 クイックリファレンス

### 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run check        # 型チェック
npm run lint         # フォーマット + 型チェック
npm run build        # 本番ビルド
npm run preview      # ビルド結果確認
```

### 主要技術

| 技術         | 役割                          |
| ------------ | ----------------------------- |
| Svelte 5     | UIフレームワーク（runes構文） |
| TypeScript 5 | 型安全性                      |
| Vite 5       | ビルドツール                  |
| CodeMirror 6 | エディタ                      |
| marked       | Markdown→HTML変換             |
| svelte-i18n  | 国際化                        |

---

## 📝 変更履歴

詳細は [CHANGELOG.md](./CHANGELOG.md) をご覧ください。

---

## 📞 サポート

- **リポジトリ**: [github.com/kako-jun/agasteer](https://github.com/kako-jun/agasteer)
- **デモサイト**: [agasteer.llll-ll.com](https://agasteer.llll-ll.com)
- **デプロイ**: Cloudflare Pages

## デザインシステム

UIの生成・修正時は `DESIGN.md` に定義されたデザインシステムに従うこと。定義外の色・フォント・スペーシングを勝手に使わない。
