/**
 * 画像自動最適化のテスト（#243）
 *
 * - 寸法計算・対象判定・拡張子差し替えは純粋関数としてそのまま検証する
 * - optimizeImageFile の効果層（フォールバック・採用判定・close 保証）は
 *   createImageBitmap / OffscreenCanvas を vi.stubGlobal でスタブして検証する。
 *   実エンコードの画質・実寸の検証は実ブラウザでの確認に委ねる
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MEDIA_OPTIMIZE_MAX_DIMENSION,
  computeOptimizedSize,
  optimizeImageFile,
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

  it('境界+1（2049px）は 2048px に縮小する', () => {
    expect(computeOptimizedSize(2049, 2049)).toEqual({ width: 2048, height: 2048 })
    expect(computeOptimizedSize(2049, 1)).toEqual({ width: 2048, height: 1 })
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

describe('optimizeImageFile（効果層。createImageBitmap / OffscreenCanvas をスタブ）', () => {
  function makeFile(name: string, size = 100): File {
    return new File(['x'.repeat(size)], name, { type: 'image/png' })
  }

  function makeBitmap(width: number, height: number) {
    return { width, height, close: vi.fn() }
  }

  function makeBlob(size: number, type = 'image/webp'): Blob {
    return new Blob(['y'.repeat(size)], { type })
  }

  /** エンコード結果 blob（null=エンコード失敗）を返す OffscreenCanvas をスタブする */
  function stubOffscreenCanvas(blob: Blob | null) {
    class FakeOffscreenCanvas {
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() {
        return { drawImage: vi.fn() }
      }
      convertToBlob() {
        return Promise.resolve(blob)
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  }

  /** デコード成功（bitmap）＋エンコード結果 blob のパイプライン一式をスタブする */
  function stubImagePipeline(bitmap: ReturnType<typeof makeBitmap>, blob: Blob | null) {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    stubOffscreenCanvas(blob)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('createImageBitmap 未対応環境では原本を返す', async () => {
    // node には createImageBitmap がない（スタブなし＝未対応環境そのもの）
    const file = makeFile('shot.png')
    await expect(optimizeImageFile(file)).resolves.toBe(file)
  })

  it('デコードが2段（EXIF付き・素）とも失敗したら console.warn 1回＋原本を返す', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const file = makeFile('shot.png')
    await expect(optimizeImageFile(file)).resolves.toBe(file)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('imageOrientation オプションで失敗したら素の createImageBitmap にフォールバックする', async () => {
    const bitmap = makeBitmap(800, 600)
    const createImageBitmapMock = vi.fn((_file: File, options?: object) =>
      options ? Promise.reject(new Error('option unsupported')) : Promise.resolve(bitmap)
    )
    vi.stubGlobal('createImageBitmap', createImageBitmapMock)
    stubOffscreenCanvas(makeBlob(10))
    const result = await optimizeImageFile(makeFile('shot.png', 100))
    expect(createImageBitmapMock).toHaveBeenCalledTimes(2)
    expect(result.name).toBe('shot.webp')
  })

  it('エンコード結果が null なら原本を返す', async () => {
    stubImagePipeline(makeBitmap(800, 600), null)
    const file = makeFile('shot.png')
    await expect(optimizeImageFile(file)).resolves.toBe(file)
  })

  it('エンコード結果が未知の MIME（image/avif）なら原本を返す', async () => {
    stubImagePipeline(makeBitmap(800, 600), makeBlob(10, 'image/avif'))
    const file = makeFile('shot.png')
    await expect(optimizeImageFile(file)).resolves.toBe(file)
  })

  it('縮小なしで WebP が原本以上のサイズなら原本を返す', async () => {
    stubImagePipeline(makeBitmap(800, 600), makeBlob(100))
    const file = makeFile('shot.png', 100)
    await expect(optimizeImageFile(file)).resolves.toBe(file)
  })

  it('縮小なしでも WebP が小さければ採用し拡張子を差し替える', async () => {
    stubImagePipeline(makeBitmap(800, 600), makeBlob(10))
    const result = await optimizeImageFile(makeFile('shot.png', 100))
    expect(result.name).toBe('shot.webp')
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(10)
  })

  it('縮小ありなら WebP が原本より肥大しても最適化版を採用する（2048px 上限は表示ポリシー）', async () => {
    // characterization: バイト数でなく表示ポリシーとしての 2048px 上限（実装コメント参照）
    stubImagePipeline(makeBitmap(4096, 2048), makeBlob(200))
    const result = await optimizeImageFile(makeFile('shot.png', 100))
    expect(result.name).toBe('shot.webp')
    expect(result.size).toBe(200)
  })

  it('成功・失敗どちらの経路でも bitmap.close() が呼ばれる', async () => {
    const success = makeBitmap(800, 600)
    stubImagePipeline(success, makeBlob(10))
    await optimizeImageFile(makeFile('shot.png', 100))
    expect(success.close).toHaveBeenCalledTimes(1)

    const failure = makeBitmap(800, 600)
    stubImagePipeline(failure, null) // エンコード失敗（blob=null）
    await optimizeImageFile(makeFile('shot.png', 100))
    expect(failure.close).toHaveBeenCalledTimes(1)
  })

  it('WebP 非対応で PNG に落ちた場合は拡張子を .png に整合させる', async () => {
    stubImagePipeline(makeBitmap(800, 600), makeBlob(10, 'image/png'))
    const result = await optimizeImageFile(makeFile('photo.jpeg', 100))
    expect(result.name).toBe('photo.png')
    expect(result.type).toBe('image/png')
  })
})
