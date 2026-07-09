/**
 * 画像自動最適化の純粋関数テスト（#243）
 *
 * canvas / createImageBitmap は jsdom で再現できないため、
 * 寸法計算・対象判定・拡張子差し替えの純粋部分だけを検証する。
 * 実エンコードの検証は実ブラウザでの確認に委ねる。
 */

import { describe, expect, it } from 'vitest'

import {
  MEDIA_OPTIMIZE_MAX_DIMENSION,
  computeOptimizedSize,
  replaceFileExtension,
  shouldOptimizeImage,
} from './image-optimize'

describe('shouldOptimizeImage', () => {
  it('静止画ラスタ（png/jpg/jpeg/webp）を対象にする', () => {
    expect(shouldOptimizeImage('screenshot.png')).toBe(true)
    expect(shouldOptimizeImage('photo.jpg')).toBe(true)
    expect(shouldOptimizeImage('photo.jpeg')).toBe(true)
    expect(shouldOptimizeImage('already.webp')).toBe(true)
  })

  it('大文字拡張子も対象にする', () => {
    expect(shouldOptimizeImage('IMG_0001.PNG')).toBe(true)
  })

  it('gif（アニメーション）・svg（ベクター）は無変換', () => {
    expect(shouldOptimizeImage('anim.gif')).toBe(false)
    expect(shouldOptimizeImage('diagram.svg')).toBe(false)
  })

  it('動画・音声・zip・拡張子なしは無変換', () => {
    expect(shouldOptimizeImage('movie.mp4')).toBe(false)
    expect(shouldOptimizeImage('sound.mp3')).toBe(false)
    expect(shouldOptimizeImage('archive.zip')).toBe(false)
    expect(shouldOptimizeImage('noext')).toBe(false)
  })
})

describe('computeOptimizedSize', () => {
  it('最大辺以下の画像は縮小しない（拡大もしない）', () => {
    expect(computeOptimizedSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(computeOptimizedSize(2048, 100)).toEqual({ width: 2048, height: 100 })
  })

  it('横長画像を最大辺 2048px に縮小する', () => {
    expect(computeOptimizedSize(4096, 2048)).toEqual({ width: 2048, height: 1024 })
  })

  it('縦長画像を最大辺 2048px に縮小する', () => {
    expect(computeOptimizedSize(1500, 3000)).toEqual({ width: 1024, height: 2048 })
  })

  it('丸めで 0 にならないよう最小 1px を保証する', () => {
    expect(computeOptimizedSize(100000, 10)).toEqual({
      width: MEDIA_OPTIMIZE_MAX_DIMENSION,
      height: 1,
    })
  })

  it('maxDimension を指定できる', () => {
    expect(computeOptimizedSize(200, 100, 100)).toEqual({ width: 100, height: 50 })
  })
})

describe('replaceFileExtension', () => {
  it('拡張子を webp に差し替える', () => {
    expect(replaceFileExtension('screenshot.png', 'webp')).toBe('screenshot.webp')
    expect(replaceFileExtension('a.b.jpeg', 'webp')).toBe('a.b.webp')
  })

  it('拡張子がない場合は末尾に付ける', () => {
    expect(replaceFileExtension('noext', 'webp')).toBe('noext.webp')
  })
})
