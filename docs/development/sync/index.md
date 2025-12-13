# GitHub同期・データ保護

GitHub連携とデータ保護機能の実装詳細。

## ドキュメント一覧

| ファイル                                   | 内容                                           | 行数 |
| ------------------------------------------ | ---------------------------------------------- | ---- |
| [github-api.md](./github-api.md)           | GitHub API統合（認証、ファイル操作、Tree API） | ~690 |
| [push-pull.md](./push-pull.md)             | Push/Pull処理フロー、回数カウント              | ~350 |
| [dirty-tracking.md](./dirty-tracking.md)   | 未保存変更の追跡、自動Push                     | ~530 |
| [stale-detection.md](./stale-detection.md) | Stale編集警告（PC/スマホ同時編集対応）         | ~150 |

## 設計原則

- **GitHubがSSoT（Single Source of Truth）**: ローカルはキャッシュ
- **force: true**: 個人用アプリなので常にPush成功を優先
- **ダーティ優先**: ローカル未保存 > リモート変更（stale）
