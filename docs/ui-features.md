# UI/UX機能

SimplestNote.mdのUI/UX関連機能の実装詳細について説明します。

## 2ペイン表示

### アスペクト比判定

画面のアスペクト比（横 > 縦）で2ペイン表示を自動切替。

```typescript
// アスペクト比を監視して isDualPane を更新（横 > 縦で2ペイン表示）
const updateDualPane = () => {
  isDualPane = window.innerWidth > window.innerHeight
}
updateDualPane()

window.addEventListener('resize', updateDualPane)
```

### レスポンシブレイアウト

```svelte
<div class="content-wrapper" class:single-pane={!isDualPane}>
  <div class="pane-divider" class:hidden={!isDualPane}></div>
  <div class="left-column">
    <!-- 左ペイン -->
  </div>
  <div class="right-column" class:hidden={!isDualPane}>
    <!-- 右ペイン -->
  </div>
</div>
```

### CSS Grid切替

```css
.content-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* ... */
}

.content-wrapper.single-pane {
  grid-template-columns: 1fr;
}

.hidden {
  display: none;
}
```

### 動作

- **スマホ縦向き**: 1ペイン表示
- **スマホ横向き**: 2ペイン表示
- **PC横長画面**: 2ペイン表示
- **画面回転時**: 自動的に切り替わる
