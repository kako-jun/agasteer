# コントリビューションガイド

Agasteerへのコントリビューションを歓迎します！

## コントリビューション方法

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

## 開発環境のセットアップ

### 必要な環境

- Node.js 18以上
- npm 9以上

### セットアップ手順

1. **リポジトリをクローン**

   ```bash
   git clone https://github.com/kako-jun/agasteer.git
   cd agasteer
   ```

2. **依存パッケージをインストール**

   ```bash
   npm install
   ```

3. **開発サーバーを起動**

   ```bash
   npm run dev
   ```

   ブラウザで `http://localhost:5173` を開きます。

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# コードフォーマット
npm run format

# フォーマットチェック
npm run format:check

# 型チェック
npm run check

# リントチェック（フォーマット + 型チェック）
npm run lint

# Huskyのセットアップ
npm run prepare
```

## コーディング規約

### フォーマット

- Prettierを使用してコードをフォーマット
- コミット前に `npm run format` を実行

### TypeScript

- 型安全性を保つため、`any`の使用は最小限に
- 全ての関数とコンポーネントに適切な型を付ける

### Svelte

- コンポーネントは単一責任の原則に従う
- 再利用可能なコンポーネントは `src/components/` に配置
- ビュー固有のコンポーネントは `src/components/views/` に配置

### コミットメッセージ

- 日本語または英語で記述
- プレフィックスを使用:
  - `feat:` 新機能
  - `fix:` バグ修正
  - `refactor:` リファクタリング
  - `docs:` ドキュメント更新
  - `style:` コードスタイルの変更
  - `test:` テスト追加・修正
  - `chore:` ビルド・ツール関連

## Pull Requestガイドライン

- 1つのPRで1つの機能または修正に集中
- 変更内容を明確に説明
- 関連するIssueがあればリンク
- テストが通ることを確認
- フォーマットと型チェックが通ることを確認

## バグ報告

バグを発見した場合:

1. GitHubのIssueで既存の報告を確認
2. 新しいIssueを作成し、以下を含める:
   - バグの詳細な説明
   - 再現手順
   - 期待される動作
   - 実際の動作
   - 環境情報（ブラウザ、OS等）

## 機能リクエスト

新機能のリクエスト:

1. GitHubのIssueで既存のリクエストを確認
2. 新しいIssueを作成し、以下を含める:
   - 機能の詳細な説明
   - ユースケース
   - 期待される動作

## ライセンス

このプロジェクトに貢献することで、あなたの貢献がMITライセンスの下で公開されることに同意したものとみなされます。

---

ご質問がある場合は、Issueで気軽にお尋ねください！
