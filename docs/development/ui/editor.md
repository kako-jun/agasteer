## 罫線エディタモード

### 概要

エディタに罫線（横線）を表示して、紙のノートのような見た目にする機能。設定画面からオン/オフを切り替え可能。

### 設定

```typescript
interface Settings {
  // ...
  linedMode: boolean // 罫線モード（デフォルト: false）
}
```

### 技術実装

#### CodeMirror拡張

```typescript
import { lineNumbers } from '@codemirror/view'

// 罫線モード用のエディタ拡張を動的に追加
function getEditorExtensions(settings: Settings) {
  const extensions = [basicSetup, markdown()]

  if (settings.linedMode) {
    extensions.push(lineNumbers())
    extensions.push(linedModeTheme)
  }

  return extensions
}
```

#### CSS実装

```css
/* 罫線スタイル（ライトテーマ） */
.cm-editor.lined-mode .cm-line {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 2px;
}

/* 罫線スタイル（ダークテーマ） */
.dark .cm-editor.lined-mode .cm-line {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* 行番号 */
.cm-editor.lined-mode .cm-gutters {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
}
```

### UI

設定画面に「罫線モード」トグルを配置（Vimモードの直上）。

```svelte
<LinedModeToggle {settings} {onSettingsChange} />
```

### 仕様

- **保存場所**: LocalStorage `Settings.linedMode`
- **デフォルト**: オフ
- **リアルタイム反映**: 設定変更後、即座にエディタに反映
- **行番号**: 罫線モード有効時に自動表示
- **テーマ対応**: ライト/ダークテーマで線色が自動調整

---
