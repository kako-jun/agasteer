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
- バッジ設定時: `mask-image` 方式で webp をマスクとして使用し、`background-color` で着色して表示
  - color 未設定時は `colors[0]`（`#8b5cf6`）にフォールバック
- クリックでバッジピッカーを開く

#### アイコン選択UI（5列グリッド、clearボタン含め33セル）

利用可能なアイコン（32種類、`public/assets/badge-icons/` に webp として配置）:

カテゴリ順:

| カテゴリ     | アイコン                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| キャラ系     | icon_female, icon_male, icon_cat_ears, icon_alien                                                                                                        |
| その他       | icon_clock, icon_coin, icon_book, icon_music, icon_plant, icon_ribbon, icon_car, icon_bag, icon_knife_fork, icon_fish, icon_fan, icon_blade, icon_saturn |
| 場所系       | icon_house, icon_building                                                                                                                                |
| エフェクト系 | icon_drop, icon_flame, icon_thought_bubble, icon_kirakira, icon_star, icon_required, icon_letter_a, icon_letter_b                                        |
| 記号系       | icon_exclamation, icon_question                                                                                                                          |
| 特殊系       | icon_millennium_puzzle, icon_kimetsu, icon_qtai                                                                                                          |

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
