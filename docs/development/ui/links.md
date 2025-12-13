## タイトルリンク化

### 概要

ヘッダーのタイトルをクリック可能なリンクに変更し、Ctrl+クリックや中クリックで別タブを開けるようにする機能。

### 実装

#### Before（ボタン）

```svelte
<button class="title-button" on:click={onTitleClick}>
  {title}
</button>
```

#### After（リンク）

```svelte
<a
  class="title-button"
  href="/"
  on:click={(e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      e.preventDefault()
      onTitleClick()
    }
  }}
>
  {title}
</a>
```

### 動作

| 操作                           | 動作                                       |
| ------------------------------ | ------------------------------------------ |
| **通常クリック**               | ホーム画面に遷移（既存動作）               |
| **Ctrl+クリック（Win/Linux）** | 新しいタブでホームを開く                   |
| **Cmd+クリック（Mac）**        | 新しいタブでホームを開く                   |
| **中クリック**                 | 新しいタブでホームを開く                   |
| **Shift+クリック**             | 新しいウィンドウでホームを開く             |
| **右クリック**                 | コンテキストメニュー（新しいタブで開く等） |

### CSS

リンクの下線を非表示：

```css
.title-button {
  text-decoration: none;
}
```

### ユースケース

- 複数タブでアプリを開く
- 左右のペインで別々のノートを開く
- ブラウザの「戻る」ボタンで履歴を辿る

---

## GitHub設定ヘルプアイコン

### 概要

GitHub設定の入力欄（リポジトリ名・トークン）に「？」アイコンを追加し、初心者向けに設定方法を画像で説明する機能。

### 実装

#### UIコンポーネント

```svelte
<div class="label-with-help">
  <label for="github-token">
    {$_('settings.github.token')} <span class="required">*</span>
  </label>
  <span class="help-icon" on:click={openTokenHelp} title="How to get GitHub token">
    <svg><!-- ?アイコン --></svg>
  </span>
</div>
```

#### モーダル表示

```svelte
{#if showTokenHelp}
  <div class="modal-overlay" on:click={closeTokenHelp}>
    <div class="modal-content" on:click={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>{$_('settings.github.tokenHelp.title')}</h3>
        <button class="close-button" on:click={closeTokenHelp}>×</button>
      </div>
      <div class="modal-body">
        <img
          src="/assets/github-token-help.png"
          alt="How to create GitHub Personal Access Token"
          class="help-image"
        />
        <p class="help-description">
          {$_('settings.github.tokenHelp.description')}
        </p>
      </div>
    </div>
  </div>
{/if}
```

### デザイン

#### ヘルプアイコン

- **位置**: ラベルの右横
- **サイズ**: 18×18px
- **色**: アクセントカラー（opacity: 0.7）
- **ホバー**: opacity: 1、scale: 1.1

```css
.help-icon {
  display: inline-flex;
  color: var(--accent-color);
  opacity: 0.7;
  cursor: pointer;
  transition: all 0.2s;
}

.help-icon:hover {
  opacity: 1;
  transform: scale(1.1);
}
```

#### モーダル

- **背景**: 半透明黒（rgba(0, 0, 0, 0.7)）
- **コンテンツ**: 最大幅800px、角丸12px
- **画像**: 100%幅、角丸8px
- **閉じる**: ×ボタン（2rem、右上）

### 説明画像

#### リポジトリ名（github-repo-help.png）

- GitHubリポジトリのURL表示
- `username/repository-name` の形式を強調

#### トークン（github-token-help.png）

- GitHub → Settings → Developer settings
- Personal access tokens → Tokens (classic)
- Generate new token
- repo権限にチェック

**現状**: 仮画像（PLACEHOLDER）
**今後**: 実際のスクリーンショットに差し替え可能

### i18n対応

翻訳ファイルに追加：

```json
{
  "settings": {
    "github": {
      "repoHelp": {
        "title": "リポジトリ名の確認方法",
        "description": "GitHubでリポジトリを開き、URLから「ユーザー名/リポジトリ名」の形式で入力してください。"
      },
      "tokenHelp": {
        "title": "GitHub Personal Access Tokenの取得方法",
        "description": "上記の手順でGitHub Personal Access Tokenを取得できます。取得したトークンは大切に保管してください。"
      }
    }
  }
}
```

### 仕様

- **対象項目**: リポジトリ名、トークン
- **画像形式**: PNG
- **言語対応**: 全言語共通の1枚（矢印・囲みで説明）
- **モーダル**: 背景クリックで閉じる、Escキーは未対応

---
