import { describe, expect, it } from 'vitest'
import {
  clampMonotonicCountdown,
  PUSH_STAGE_TOTAL,
  PUSH_STAGE_REFS,
  PUSH_STAGE_BASE_TREE,
  PUSH_STAGE_UPLOAD,
  PUSH_STAGE_COMMIT,
  PUSH_STAGE_FINALIZE,
} from './push-stages'

describe('clampMonotonicCountdown: 単調減少ガード (#238)', () => {
  it('未表示（null）からは通知値をそのまま採用する', () => {
    expect(clampMonotonicCountdown(null, 5)).toBe(5)
  })

  it('減少（4→3）は採用する', () => {
    expect(clampMonotonicCountdown(4, 3)).toBe(3)
  })

  it('同値（4→4）は据え置く', () => {
    expect(clampMonotonicCountdown(4, 4)).toBe(4)
  })

  it('増加（4→5）は据え置く（表示の数字は絶対に増えない）', () => {
    expect(clampMonotonicCountdown(4, 5)).toBe(4)
  })

  it('最終ステージ（1）表示中に最大値（5）が来ても不動', () => {
    expect(clampMonotonicCountdown(1, 5)).toBe(1)
  })
})

describe('Push ステージ定数の整合 (#238)', () => {
  it('TOTAL=5 で、各ステージ定数が 5,4,3,2,1 の重複なしカウントダウンを成す', () => {
    expect(PUSH_STAGE_TOTAL).toBe(5)
    const stages = [
      PUSH_STAGE_REFS,
      PUSH_STAGE_BASE_TREE,
      PUSH_STAGE_UPLOAD,
      PUSH_STAGE_COMMIT,
      PUSH_STAGE_FINALIZE,
    ]
    expect(stages).toEqual([5, 4, 3, 2, 1])
    expect(new Set(stages).size).toBe(PUSH_STAGE_TOTAL)
  })
})
