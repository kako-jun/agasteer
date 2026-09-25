/**
 * ペイン単位の表示状態（#300）
 *
 * core-state.svelte.ts から分離（PR #309 レビュー nit: core-state.svelte.ts が
 * 400行ハウスルールを超過したため）。左右ペインに現在表示中のノート/リーフ/ビュー/
 * 検索ジャンプ行を保持する $state 宣言のみを置く。core-state.svelte.ts と同様、
 * 他の stores/ サブモジュールを import しない一方向の基盤レイヤー（循環 import 回避）。
 */

import type { Note, Leaf, View } from '../types'

// ペイン状態ストア
let _leftNote = $state<Note | null>(null)
export const leftNote = {
  get value() {
    return _leftNote
  },
  set value(v: Note | null) {
    _leftNote = v
  },
}

let _rightNote = $state<Note | null>(null)
export const rightNote = {
  get value() {
    return _rightNote
  },
  set value(v: Note | null) {
    _rightNote = v
  },
}

let _leftLeaf = $state<Leaf | null>(null)
export const leftLeaf = {
  get value() {
    return _leftLeaf
  },
  set value(v: Leaf | null) {
    _leftLeaf = v
  },
}

let _rightLeaf = $state<Leaf | null>(null)
export const rightLeaf = {
  get value() {
    return _rightLeaf
  },
  set value(v: Leaf | null) {
    _rightLeaf = v
  },
}

let _leftView = $state<View>('home')
export const leftView = {
  get value() {
    return _leftView
  },
  set value(v: View) {
    _leftView = v
  },
}

let _rightView = $state<View>('home')
export const rightView = {
  get value() {
    return _rightView
  },
  set value(v: View) {
    _rightView = v
  },
}

// 検索結果クリック時に直接ジャンプする行番号（0 = ジャンプなし）
let _leftInitialLine = $state<number>(0)
export const leftInitialLine = {
  get value() {
    return _leftInitialLine
  },
  set value(v: number) {
    _leftInitialLine = v
  },
}

let _rightInitialLine = $state<number>(0)
export const rightInitialLine = {
  get value() {
    return _rightInitialLine
  },
  set value(v: number) {
    _rightInitialLine = v
  },
}
