# インポート機能 設計

他アプリのエクスポートデータをAgasteerに取り込む機能。

## アーキテクチャ

```
File → 自動判定 → パーサー → ImportParseResult → processImportFile → Note + Leaves + Report
```

### ソース自動判定

ファイル拡張子だけでは区別できない（SimpleNoteもGoogle KeepもJSONを使う）ため、**中身を見て判定する**。

| チェック順 | 条件                                                               | ソース                     |
| ---------- | ------------------------------------------------------------------ | -------------------------- |
| 1          | ZIP内に `.agasteer/notes/metadata.json`                            | Agasteer形式（別フロー）   |
| 2          | JSONに `activeNotes` キー                                          | SimpleNote                 |
| 3          | ZIP内にKeepのJSON群（`isTrashed`, `isArchived` キー持ち）          | Google Keep Takeout        |
| 4          | JSONに `isTrashed` + `isArchived` + `textContent` or `listContent` | Google Keep 単体JSON       |
| 5          | `.txt` ファイル                                                    | SimpleNote txt（従来互換） |
| 6          | いずれにも該当しない                                               | エラー: 未対応フォーマット |

### ImportParseResult

```typescript
interface ImportParseResult {
  source: 'simplenote' | 'google-keep' // 拡張可能
  leaves: ImportedLeafData[]
  skipped: number
  errors: string[]
  sanitizedTitles: string[]
  unsupported: string[] // 新規: 対応できなかった要素の説明
}
```

### processImportFile（共通）

パーサーがソースごとの差を吸収し、`processImportFile` は共通。

- `source` に応じてノート名を決定: `SimpleNote_1`, `GoogleKeep_1` 等
- `source` に応じてレポートテキストを生成

## Google Keep パーサー

### 入力

SimpleNoteと同様に、ZIPでも解凍済みでも受け付ける:

| 形態     | 説明                     | 動作                                                 |
| -------- | ------------------------ | ---------------------------------------------------- |
| **ZIP**  | Takeout ZIPそのまま      | `Takeout/Keep/*.json` を探して全ノート一括インポート |
| **JSON** | 解凍後の個別JSONファイル | その1ノートをインポート                              |

SimpleNote対応表との対比:

| 形態 | SimpleNote                   | Google Keep                    |
| ---- | ---------------------------- | ------------------------------ |
| ZIP  | `.zip`内のJSON/TXTを展開     | Takeout ZIP内のKeep JSONを展開 |
| JSON | `activeNotes` 配列で全ノート | 1ファイル = 1ノート            |
| TXT  | 単一テキスト → 1リーフ       | N/A（Keepにtxt形式なし）       |

### Keep JSONの構造

```json
{
  "color": "DEFAULT",
  "isTrashed": false,
  "isPinned": false,
  "isArchived": true,
  "title": "メモのタイトル",
  "textContent": "本文テキスト",
  "userEditedTimestampUsec": 1653870913735000,
  "createdTimestampUsec": 1601445199212000,
  "annotations": [{ "title": "...", "url": "...", "source": "WEBLINK" }],
  "attachments": [{ "filePath": "image.png", "mimetype": "image/png" }],
  "listContent": [{ "text": "item", "isChecked": false }],
  "labels": [{ "name": "ラベル名" }]
}
```

### 変換ルール

| Keep                      | Agasteer                       | 備考                                  |
| ------------------------- | ------------------------------ | ------------------------------------- |
| `title`                   | リーフのタイトル / ファイル名  | 空なら本文先頭行 or "Untitled"        |
| `textContent`             | リーフ本文                     | 先頭/末尾空行除去                     |
| `listContent`             | `- [ ]` / `- [x]`              | textContentの代わりにこちらがある場合 |
| `annotations`             | 本文末に `## Links` セクション | 本文中に既にURLがあれば重複追記しない |
| `userEditedTimestampUsec` | `updatedAt` (ms)               | μsec → msec 変換                      |
| `isTrashed: true`         | スキップ                       | レポートに記録                        |
| `color`                   | **非対応**                     | レポートに記録                        |
| `attachments`             | **非対応**                     | レポートに記録（ファイル名一覧）      |
| `labels`                  | **非対応**                     | レポートに記録                        |
| `isPinned`                | **非対応**                     | レポートに記録                        |
| `textContentHtml`         | **使用しない**                 | プレーンテキスト優先                  |
| `.html` ファイル          | **使用しない**                 | JSONのみ使用                          |
| 画像ファイル              | **使用しない**                 | JSONのみ使用                          |

### リーフタイトルの決定

1. `title` が非空 → sanitize して使用
2. `title` が空 → `textContent` の先頭行（空行除去後）
3. どちらもない → `listContent` の最初のアイテム
4. 全て空 → "Untitled"

## レポートリーフ

各ソース共通で、インポートしたノート内の最初のリーフとして生成。

### 内容

```
{source} インポート完了
ソース: {source} ({fileType})
取り込みリーフ: {count}
スキップ: {skipped}
配置: ノート「{noteName}」を作成

移行しないもの: {unsupported の各項目}

各項目:
- {title}: プレーンテキストで取り込み。...
```

### i18n

レポートテキストのi18nキーをソース非依存にする:

- `importReportHeader` → `{source} import completed` （パラメータ化）
- `importReportSource` → `Source: {source} ({fileTypes})`

## 既存SimpleNoteパーサーとの差分

| 項目           | SimpleNote                            | Google Keep                          |
| -------------- | ------------------------------------- | ------------------------------------ |
| ファイル形式   | JSON (activeNotes配列) / ZIP / TXT    | ZIP (複数JSON) / JSON (1ノート)      |
| タイトル       | なし（本文先頭行から推定）            | `title` フィールドあり               |
| チェックリスト | なし                                  | `listContent` あり                   |
| リンク         | なし                                  | `annotations` あり                   |
| 画像           | なし                                  | `attachments` あり（非対応）         |
| タイムスタンプ | `lastModified` (ISO文字列)            | `userEditedTimestampUsec` (μsec整数) |
| 削除済み判定   | 別配列 `trashedNotes`（取り込まない） | `isTrashed: true`（スキップ）        |

## 拡張性

新しいソースを追加する手順:

1. `importers.ts` にパーサー関数を追加
2. `ImportParseResult.source` にリテラル型を追加
3. 自動判定ロジックに条件を追加
4. i18n にソース固有のテキストを追加（必要なら）
5. ユーザーガイドを更新
