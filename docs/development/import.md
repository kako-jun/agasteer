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
| 5          | JSONに `name`（文字列）+ `exported`（数値）+ `pages`（配列）       | Cosense (Scrapbox)         |
| 6          | `.txt` ファイル                                                    | SimpleNote txt（従来互換） |
| 7          | いずれにも該当しない                                               | エラー: 未対応フォーマット |

### ImportParseResult

```typescript
interface ImportParseResult {
  source: 'simplenote' | 'google-keep' | 'cosense' // 拡張可能
  leaves: ImportedLeafData[]
  skipped: number
  errors: string[]
  sanitizedTitles: string[]
  unsupported: string[] // 新規: 対応できなかった要素の説明
}
```

### processImportFile（共通）

パーサーがソースごとの差を吸収し、`processImportFile` は共通。

- `source` に応じてノート名を決定: `SimpleNote_1`, `GoogleKeep_1`, `Cosense_1` 等
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

| Keep                      | Agasteer                               | 備考                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                   | リーフのタイトル / ファイル名          | 空なら本文先頭行 or "Untitled"                                                                                                                                                                                                                                                                                                   |
| `textContent`             | リーフ本文                             | 先頭/末尾空行除去                                                                                                                                                                                                                                                                                                                |
| `listContent`             | `- [ ]` / `- [x]`                      | textContentの代わりにこちらがある場合                                                                                                                                                                                                                                                                                            |
| `annotations`             | 本文末に `## Links` セクション         | 本文中に既にURLがあれば重複追記しない                                                                                                                                                                                                                                                                                            |
| `userEditedTimestampUsec` | `updatedAt` (ms)                       | μsec → msec 変換                                                                                                                                                                                                                                                                                                                 |
| `isTrashed: true`         | スキップ                               | レポートに記録                                                                                                                                                                                                                                                                                                                   |
| `color`                   | **非対応**                             | レポートに記録                                                                                                                                                                                                                                                                                                                   |
| `attachments`             | メディアリポへ自動アップロード（#249） | zip 内の実体を解決（JSON と同階層 → パス完全一致 → ベース名）→ **取り込み確定後**（重複ダイアログの後）に `applyImportedAttachments` がアップロード → 本文末尾に記法追記（画像 `![name](rawURL)` / 他 `[name](rawURL)`。最適化設定に従い名前は .webp になり得る）。実体なし/メディア未設定/形式外（.3gp 録音等）はレポートに記録 |
| `labels`                  | **非対応**                             | レポートに記録                                                                                                                                                                                                                                                                                                                   |
| `isPinned`                | **非対応**                             | レポートに記録                                                                                                                                                                                                                                                                                                                   |
| `textContentHtml`         | **使用しない**                         | プレーンテキスト優先                                                                                                                                                                                                                                                                                                             |
| `.html` ファイル          | **使用しない**                         | JSONのみ使用                                                                                                                                                                                                                                                                                                                     |
| 画像ファイル              | 添付解決に使用（#249）                 | `attachments[].filePath` を JSON と同階層 → パス完全一致 → ベース名一致の順で解決                                                                                                                                                                                                                                                |

### リーフタイトルの決定

1. `title` が非空 → sanitize して使用
2. `title` が空 → `textContent` の先頭行（空行除去後）
3. どちらもない → `listContent` の最初のアイテム
4. 全て空 → "Untitled"

## Cosense (Scrapbox) パーサー

### 入力

| 形態     | 説明                       | 動作                   |
| -------- | -------------------------- | ---------------------- |
| **JSON** | プロジェクトのエクスポート | `pages[]` を全ノート化 |

Cosense にはZIP形式のエクスポートがないため、`.json` のみ受け付ける。

### Cosense エクスポートJSONの構造

```json
{
  "name": "project-name",
  "displayName": "Project",
  "exported": 1700000000,
  "users": [],
  "pages": [
    {
      "title": "ページ名",
      "created": 1700000000,
      "updated": 1700000100,
      "id": "...",
      "views": 42,
      "image": "https://.../thumb.png",
      "lines": [
        { "text": "ページ名", "created": 1700000000, "updated": 1700000000, "userId": "..." },
        { "text": "本文", "created": 1700000000, "updated": 1700000000, "userId": "..." }
      ]
    }
  ]
}
```

### 記法変換

| Cosense                                                | Agasteer (Markdown) | 備考                                       |
| ------------------------------------------------------ | ------------------- | ------------------------------------------ |
| `[URL 説明]` / `[説明 URL]`                            | `[説明](URL)`       | 空白区切りの最初のURLトークンを拾う        |
| `[URL]`（`.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`/`.svg`） | `![](URL)`          | 外部画像としてレポートに記録               |
| `[URL]`（非画像単独）                                  | `<URL>`             | 自動リンク                                 |
| `[ページ名]`（URLを含まない）                          | `[ページ名]`        | 解決先なしでそのまま保持（レポートに記録） |
| `#tag`                                                 | `#tag`              | 内部タグ解決先なしでプレーンテキスト扱い   |
| 行頭のインデント（空白・タブ）                         | そのまま保持        | Cosense のアウトライン構造を失わない       |
| `page.title` と先頭行が一致                            | 先頭行を除去        | Cosense 慣習に合わせて重複排除             |
| `page.updated` (秒)                                    | `updatedAt` (ms)    | `× 1000` 変換                              |

### 非対応として unsupported に記録する項目

常に記録されるもの:

- `user attribution and line timestamps`
- `hashtags kept as plain text (no internal link target)`
- `internal [page name] links kept as bracketed text`

検出されたときのみ記録されるもの:

- `external images (URLs preserved; host availability not guaranteed)` — ブラケット記法に画像URLが含まれた場合
- `page thumbnails (page.image)` — `page.image` が非 null
- `page views count` — `page.views` が数値
- `Cosense decorations ([*, [**, [/, [-] kept as-is)` — `[* ...]` `[** ...]` `[/ ...]` `[- ...]` を検出
- `math blocks ([$ ...]) kept as-is` — `[$ ...]` を検出
- `code blocks (code:filename) kept as plain text` — 行頭 `code:` を検出
- `tables (table:name) kept as plain text` — 行頭 `table:` を検出

### リーフタイトルの決定

- `page.title` が文字列ならそれを使用（`sanitizeTitle` でファイル名安全化）
- `page.title` が無ければ `Page {index+1}`

### ノート名

- `Cosense_1`（衝突時は `Cosense_2`, `Cosense_3`, ...）

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

| 項目           | SimpleNote                            | Google Keep                                            | Cosense (Scrapbox)                                                                        |
| -------------- | ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| ファイル形式   | JSON (activeNotes配列) / ZIP / TXT    | ZIP (複数JSON) / JSON (1ノート)                        | JSON (pages配列) のみ                                                                     |
| タイトル       | なし（本文先頭行から推定）            | `title` フィールドあり                                 | `page.title` フィールドあり                                                               |
| チェックリスト | なし                                  | `listContent` あり                                     | なし                                                                                      |
| リンク         | なし                                  | `annotations` あり                                     | `[URL 説明]` 記法 → Markdownリンクに変換                                                  |
| 画像           | なし                                  | `attachments` → メディアリポへ自動アップロード（#249） | `[画像URL]` 記法 → `![](URL)` に変換（外部 URL のまま。再アップロードはしない #249 判断） |
| タイムスタンプ | `lastModified` (ISO文字列)            | `userEditedTimestampUsec` (μsec整数)                   | `page.updated` (UNIX秒)                                                                   |
| 削除済み判定   | 別配列 `trashedNotes`（取り込まない） | `isTrashed: true`（スキップ）                          | なし（エクスポートに削除済みは含まれない）                                                |

## 拡張性

新しいソースを追加する手順:

1. `importers.ts` にパーサー関数を追加
2. `ImportParseResult.source` にリテラル型を追加
3. 自動判定ロジックに条件を追加
4. i18n にソース固有のテキストを追加（必要なら）
5. ユーザーガイドを更新

## 添付自動アップロードの設計判断（#249）

- **対象形式**: メディアの既存ホワイトリスト（画像/動画/音声/zip）に従う。個別の絞り込みはしない（Keep が実際に出すのは画像と .3gp 録音のみで、.3gp は形式外としてレポートされる）
- **アップロードのタイミング**: 重複ノートの確認ダイアログで cancel / skip され得るため、**取り込みが確定した後**に行う（先に行うと参照ゼロの孤児メディアがリポに残る）
- **Cosense の外部画像 URL**: `![](URL)` のまま残す（ダウンロード → 再アップロードはしない。外部ホスト依存は従来からレポート済み）
- **メモリ上の制約（既知の限界）**: zip 内の添付はパース時に一括で ArrayBuffer 化するため、数百枚規模の巨大 Takeout ではピークメモリが大きくなる。処理済みリーフから順にバッファを解放して緩和しているが、遅延読み込み化は必要になってから検討する
