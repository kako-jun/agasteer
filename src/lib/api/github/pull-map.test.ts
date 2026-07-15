import { describe, expect, it } from 'vitest'

import { collapseToTwoLevels } from './pull-map'

describe('collapseToTwoLevels', () => {
  it('returns an empty array unchanged', () => {
    expect(collapseToTwoLevels([])).toEqual([])
  })

  it('keeps a single level', () => {
    expect(collapseToTwoLevels(['a'])).toEqual(['a'])
  })

  it('keeps two levels', () => {
    expect(collapseToTwoLevels(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('collapses three levels into two, joining the tail with sanitize (/ -> -)', () => {
    expect(collapseToTwoLevels(['a', 'b', 'c'])).toEqual(['a', 'b-c'])
  })

  it('collapses four or more levels into the first + sanitized remainder', () => {
    expect(collapseToTwoLevels(['a', 'b', 'c', 'd'])).toEqual(['a', 'b-c-d'])
  })

  it('sanitizes each part even when not collapsing', () => {
    expect(collapseToTwoLevels(['a/b', 'c'])).toEqual(['a-b', 'c'])
  })
})
