# 設定の保存先

各設定がどこに保存されるかの一覧です。

---

## 一覧

| 設定項目         | 保存先                       |
| ---------------- | ---------------------------- |
| テーマ           | LocalStorage + GitHub        |
| 言語             | LocalStorage + GitHub        |
| 罫線モード       | LocalStorage                 |
| Vimモード        | LocalStorage                 |
| カスタムフォント | IndexedDB（ブラウザのみ）    |
| 背景画像         | IndexedDB（ブラウザのみ）    |
| GitHub Token     | LocalStorage（ブラウザのみ） |
| リポジトリ履歴   | LocalStorage（ブラウザのみ） |

---

## 補足

- **LocalStorage + GitHub**: デバイス間で同期される
- **LocalStorage**: そのブラウザのみ
- **IndexedDB**: そのブラウザのみ（サイズが大きいデータ向け）
