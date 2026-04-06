## バッジ機能（アイコン＋色パレット）

### 概要

ノートとリーフのカード右上にバッジを表示する機能。アイコンと色を自由に組み合わせて視覚的に区別できます。

### データ構造

Note型とLeaf型に以下のオプションフィールドを追加：

| フィールド | 型     | 説明                                            |
| ---------- | ------ | ----------------------------------------------- |
| badgeIcon  | string | アイコン識別子（例: 'icon_star', 'icon_flame'） |
| badgeColor | string | カラーコード（例: '#8b5cf6'）                   |

### UI実装

#### バッジ表示

- バッジ未設定時: 「+」マークを表示
- バッジ設定時: webp画像アイコンを表示
- クリックでバッジピッカーを開く

#### アイコン選択UI（5列グリッド、clearボタン含め33セル）

利用可能なアイコン（32種類、`public/assets/badge-icons/` に webp として配置）:

icon_alien, icon_bag, icon_blade, icon_book, icon_building, icon_car, icon_cat_ears, icon_clock, icon_coin, icon_drop, icon_exclamation, icon_fan, icon_female, icon_fish, icon_flame, icon_house, icon_kimetsu, icon_kirakira, icon_knife_fork, icon_letter_a, icon_letter_b, icon_male, icon_millennium_puzzle, icon_music, icon_plant, icon_qtai, icon_question, icon_required, icon_ribbon, icon_saturn, icon_star, icon_thought_bubble

#### 色選択UI（5色パレット）

| 色  | カラーコード |
| --- | ------------ |
| 紫  | #8b5cf6      |
| 青  | #3b82f6      |
| 緑  | #10b981      |
| 金  | #c7a443      |
| 赤  | #ef4444      |

### 保存先

- **IndexedDB**: ノート/リーフのフィールドとして保存
- **GitHub**: `metadata.json`内の各ノート/リーフエントリに保存

---
