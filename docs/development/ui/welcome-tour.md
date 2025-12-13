## ウェルカムポップアップ

### 概要

初回訪問時に表示されるウェルカムポップアップ。アプリの使い方を簡潔に紹介し、ユーザーがスムーズに開始できるようサポートします。

### 機能

- **言語自動検出**: ブラウザ/OSの言語設定に基づいて日本語/英語で表示
- **レスポンシブ対応**: スマートフォンなど狭い画面ではボタンが縦並びに配置
- **初回のみ表示**: LocalStorageで表示済みフラグを管理

### レスポンシブ実装

```css
.welcome-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* 狭い画面ではボタンを縦配置 */
@media (max-width: 480px) {
  .welcome-buttons {
    flex-direction: column;
  }

  .welcome-buttons button {
    width: 100%;
  }
}
```

### i18n対応

```json
{
  "welcome": {
    "title": "Agasteerへようこそ",
    "description": "シンプルなMarkdownノートアプリ",
    "getStarted": "始める",
    "learnMore": "詳しく見る"
  }
}
```

---

---

## オンボーディングツアー（2025-12）

初回ユーザー向けのインタラクティブな使い方ガイド。

### 使用ライブラリ

**driver.js** を採用:

- MITライセンス（商用無料）
- 軽量（~5KB）
- 依存なし
- Svelte/vanilla JS対応

```bash
npm install driver.js
```

### ツアーステップ

| #   | ステップ    | 要素ID              | 説明                                                     |
| --- | ----------- | ------------------- | -------------------------------------------------------- |
| 1   | Welcome     | なし（中央表示）    | Agasteerへようこそ！基本的な使い方を説明します。         |
| 2   | Create Note | `#tour-create-note` | ノートを作る。ノートはリーフをまとめるフォルダ。         |
| 3   | Create Leaf | `#tour-create-leaf` | リーフを作る。リーフは実際にメモを書くページ。           |
| 4   | Push        | `#tour-save`        | GitHubに保存。Ctrl+S / Cmd+S でもPush可能。              |
| 5   | Pull        | `#tour-pull`        | 起動時に自動Pull。別デバイスからの変更を取り込む。       |
| 6   | Settings    | `#tour-settings`    | テーマ・フォントのカスタマイズ、マニュアルリンク。       |
| 7   | Offline     | なし（中央表示）    | Offlineリーフはオフライン用、GitHub同期なし。            |
| 8   | Priority    | なし（中央表示）    | Priorityリーフは[1]〜[5]マーカー自動収集、読み取り専用。 |
| 9   | Finish      | なし（中央表示）    | 準備完了！困ったら設定画面のマニュアルリンクへ。         |

### トリガー条件

```typescript
// 初回Pull成功後にツアーを表示（まだ表示されていない場合）
if (isInitial && !isTourShown()) {
  // UIが落ち着いてからツアーを開始
  setTimeout(() => startTour(), 500)
}
```

- **表示タイミング**: 初回Pull成功後（500ms遅延）
- **再表示防止**: LocalStorage (`agasteer_tour_shown`) で管理
- **スキップ可能**: ×ボタンまたはオーバーレイクリックで閉じる

### ファイル構成

```
src/lib/tour.ts
├── isTourShown()      # ツアー表示済み判定
├── markTourShown()    # ツアー表示済みマーク
├── getTourSteps()     # ステップ定義（i18n対応）
├── startTour()        # ツアー開始
└── resetTour()        # ツアーリセット（デバッグ用）

src/App.css
└── .driver-popover    # ツアーポップオーバーのカスタムスタイル

src/lib/i18n/locales/
├── ja.json            # 日本語翻訳（tour.*）
└── en.json            # 英語翻訳（tour.*）
```

### 要素ID配置

```
Header.svelte
├── #tour-pull         # Pullボタン wrapper
└── #tour-settings     # 設定ボタン wrapper

HomeFooter.svelte
├── #tour-create-note  # ノート作成ボタン wrapper
└── #tour-save         # Pushボタン（SaveButton経由）

NoteFooter.svelte
└── #tour-create-leaf  # リーフ作成ボタン wrapper

SaveButton.svelte
└── id prop            # 任意のIDを設定可能
```

### カスタムCSS

App.cssでdriver.jsのデフォルトスタイルを上書き:

```css
.driver-popover {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.driver-popover-navigation-btns .driver-popover-next-btn {
  background: var(--accent);
  color: var(--bg);
}
```

### デバッグ

開発者コンソールでツアーをリセット:

```javascript
localStorage.removeItem('agasteer_tour_shown')
location.reload()
```
