# 実 GitHub 往復 e2e テストのセットアップ・ランブック

`tests/e2e/github-sync.e2e.test.ts` は、`pushAllWithTreeAPI` / `pullFromGitHub`
（`src/lib/api/github.ts`）を**実際の GitHub API** に対して呼び、notes ツリー
（`.agasteer/notes/`）の push→pull 往復健全性・冪等性・増分反映を検証する e2e テストです。
fetch はモックしません。

通常の `npm test` / CI では env ゲートで**丸ごと skip**されます（緑のまま）。
下記の env を揃えたときだけ走ります。

> **実 GitHub に対して検証済み**（2026-07-15・使い捨てリポ `kako-jun/agasteer-test`）。
> push→pull 往復一致・冪等 push の noChanges・1リーフ増分反映の3件が実 GitHub で green。
> 実ネットワーク往復は vitest 既定の5秒を超えるため、各テストに `E2E_TIMEOUT`（60秒）を設定済み。

---

## kako-jun がやる手作業は 2 つだけ

1. **使い捨てテスト用リポジトリを作る**
2. **そのリポだけに書ける fine-grained PAT を発行する**

あとは env を渡して `npm run test:e2e` を叩けば即走ります。

---

## 1. 使い捨てテスト用リポジトリを作る

- 例: `kako-jun/agasteer-e2e-fixture`（**private 可**）
- **本物の notes リポは絶対に使わない。**
  このアプリの push は `.agasteer/notes/` ツリー全体を**上書き再構築**します。
  本物のリポを誤って指すと中身を破壊します。
- **中身が消えてよいリポであること。** テストは毎 run このリポを書き換え、
  最後に既知のベース状態へ reset push します。
- 空リポでも構いません（テストが初回 push で初期化します）。

```sh
gh repo create kako-jun/agasteer-e2e-fixture --private --description "Agasteer e2e fixture (disposable, contents will be overwritten)"
```

## 2. fine-grained PAT を発行する

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token

- **Repository access**: Only select repositories → `agasteer-e2e-fixture` **だけ**
- **Permissions** → Repository permissions → **Contents: Read and write**
  （他のリポ・他の権限は一切付けない）
- Expiration は短め（テスト時のみ使うなら 7〜30 日で十分）

発行されたトークン文字列を控えます（**commit しない**）。

---

## 3. env 一覧

| env                         | 必須 | 説明                                                     |
| --------------------------- | ---- | -------------------------------------------------------- |
| `AGASTEER_E2E_GITHUB_TOKEN` | ○    | 上で発行した fine-grained PAT                            |
| `AGASTEER_E2E_OWNER`        | ○    | テスト用リポの owner（例: `kako-jun`）                   |
| `AGASTEER_E2E_REPO`         | ○    | テスト用リポ名（例: `agasteer-e2e-fixture`）             |
| `AGASTEER_E2E_ALLOW_WRITES` | ○    | **`1` のときだけ書き込みを許可**（誤爆防止の必須フラグ） |

> ブランチは指定不要。sync 層（push/pull）はリポの default branch を自動検出する。

`AGASTEER_E2E_ALLOW_WRITES=1` が無いと、トークン等が揃っていても describe ごと skip され、
**一切書き込みません**。本物リポへの誤爆を防ぐ二重ガードです。

---

## 4. 実行方法

env をその場で渡して `test:e2e` を叩きます（`-t e2e` で e2e 名のテストだけ走ります）:

```sh
AGASTEER_E2E_GITHUB_TOKEN='github_pat_...' \
AGASTEER_E2E_OWNER='kako-jun' \
AGASTEER_E2E_REPO='agasteer-e2e-fixture' \
AGASTEER_E2E_ALLOW_WRITES=1 \
npm run test:e2e
```

env を渡さずに `npm test` / `npm run test:e2e` を叩いた場合、往復テストは skip され、
「e2e suite is skipped when env is absent」という sanity テストだけが green になります。

---

## 5. テスト内容

直列（宣言順）に実行されます:

1. **往復一致** — 複数ノート・サブフォルダ・日本語/絵文字を含むリーフ・metadata を構築 →
   push → pull → 相対パス→本文の Map・ノート構造・metadata エントリが push 内容と一致。
2. **冪等 push** — 同一状態をもう一度 push → `github.noChanges` 経路。
3. **増分** — 1 リーフだけ本文変更 → 再 push（`changedLeafCount === 1`）→ pull で反映確認。

`afterAll` で既知のベース状態へ reset push し、次回 run をクリーンに保ちます。

---

## 6. 安全注意

- **本物の notes リポを `AGASTEER_E2E_REPO` に指さない。** 使い捨て fixture リポ専用。
- **トークンを commit しない。** `.env` / `.env.local` は `.gitignore` 済み
  （リポ直下 `.gitignore` の "Environment variables" セクションを参照）。
  シェルにその場で渡すのが最も安全。
- PAT は対象リポの Contents read/write **だけ**。他リポ・他権限を与えない。
- テストは push で全 notes ツリーを上書きする。fixture リポの中身は消えてよい前提。
