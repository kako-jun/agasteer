# プレビュー機能

マークダウンプレビューと関連機能の実装詳細。

## ドキュメント一覧

| ファイル                             | 内容                                         | 行数 |
| ------------------------------------ | -------------------------------------------- | ---- |
| [markdown.md](./markdown.md)         | マークダウンプレビュー（marked + DOMPurify） | ~240 |
| [scroll-sync.md](./scroll-sync.md)   | 編集/プレビュー間のスクロール同期            | ~300 |
| [image-export.md](./image-export.md) | 画像ダウンロード・シェア（html2canvas）      | ~430 |

## 概要

- **marked**: マークダウン→HTML変換
- **DOMPurify**: XSSサニタイゼーション
- **html2canvas**: プレビューを画像化
- **Clipboard API / Web Share API**: 画像のコピー・共有
