import { describe, expect, it } from 'vitest'
import { clampSelectionRanges } from './clamp-selection'

describe('clampSelectionRanges (#170)', () => {
  it('既存の単一カーソル位置を保持する', () => {
    const result = clampSelectionRanges([{ anchor: 5, head: 5 }], 10)
    expect(result).toEqual([{ anchor: 5, head: 5 }])
  })

  it('doc 短縮時に範囲外のカーソルを末尾にクランプする', () => {
    const result = clampSelectionRanges([{ anchor: 20, head: 20 }], 10)
    expect(result).toEqual([{ anchor: 10, head: 10 }])
  })

  it('マルチカーソルの全 range を保持する', () => {
    const result = clampSelectionRanges(
      [
        { anchor: 0, head: 0 },
        { anchor: 3, head: 7 },
        { anchor: 12, head: 12 },
      ],
      10
    )
    expect(result).toEqual([
      { anchor: 0, head: 0 },
      { anchor: 3, head: 7 },
      { anchor: 10, head: 10 },
    ])
  })

  it('負の anchor/head を 0 にクランプする', () => {
    const result = clampSelectionRanges([{ anchor: -5, head: -1 }], 10)
    expect(result).toEqual([{ anchor: 0, head: 0 }])
  })

  it('空の ranges 入力で空配列を返す', () => {
    expect(clampSelectionRanges([], 10)).toEqual([])
  })
})
