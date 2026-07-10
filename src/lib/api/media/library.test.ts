/**
 * メディアライブラリ純粋層のテスト（#250）
 *
 * 対象: contentsItemToMediaAsset / mapContentsToMediaAssets / formatMediaSize
 * fetch・IO には触れない純粋関数なので node 環境で完結する。
 */

import { describe, expect, it } from 'vitest'
import {
  contentsItemToMediaAsset,
  mapContentsToMediaAssets,
  formatMediaSize,
  type GitHubContentsItem,
} from './library'

const REPO = 'owner/repo-media'

function item(overrides: Partial<GitHubContentsItem> = {}): GitHubContentsItem {
  return {
    name: '20260101-abcd1234-photo.png',
    path: '20260101-abcd1234-photo.png',
    size: 1234,
    sha: 'sha-1',
    type: 'file',
    download_url: 'https://example.com/dl.png',
    ...overrides,
  }
}

describe('contentsItemToMediaAsset', () => {
  it('対応形式のファイルを MediaAsset に変換し raw URL を再構成する', () => {
    const asset = contentsItemToMediaAsset(item(), REPO)
    expect(asset).toEqual({
      name: '20260101-abcd1234-photo.png',
      path: '20260101-abcd1234-photo.png',
      size: 1234,
      sha: 'sha-1',
      downloadUrl: 'https://example.com/dl.png',
      rawUrl: 'https://raw.githubusercontent.com/owner/repo-media/main/20260101-abcd1234-photo.png',
    })
  })

  it('download_url が null/未定義なら downloadUrl は undefined', () => {
    expect(
      contentsItemToMediaAsset(item({ download_url: null }), REPO)?.downloadUrl
    ).toBeUndefined()
  })

  it('ディレクトリ項目は除外する（null）', () => {
    expect(contentsItemToMediaAsset(item({ type: 'dir' }), REPO)).toBeNull()
  })

  it('.gitkeep（拡張子なし）は除外する（null）', () => {
    expect(contentsItemToMediaAsset(item({ name: '.gitkeep', path: '.gitkeep' }), REPO)).toBeNull()
  })

  it('対応形式外（例: txt）は除外する（null）', () => {
    expect(contentsItemToMediaAsset(item({ name: 'note.txt', path: 'note.txt' }), REPO)).toBeNull()
  })

  it('動画・音声・zip は対応形式として通す', () => {
    for (const name of ['a.mp4', 'b.mp3', 'c.zip']) {
      expect(contentsItemToMediaAsset(item({ name, path: name }), REPO)).not.toBeNull()
    }
  })
})

describe('mapContentsToMediaAssets', () => {
  it('非対応/ディレクトリを除外し、名前の降順（新しい順）で並べる', () => {
    const items: GitHubContentsItem[] = [
      item({ name: '20260101-a-x.png', path: '20260101-a-x.png' }),
      item({ name: '.gitkeep', path: '.gitkeep' }),
      item({ name: 'sub', path: 'sub', type: 'dir' }),
      item({ name: '20260305-b-y.png', path: '20260305-b-y.png' }),
      item({ name: 'readme.md', path: 'readme.md' }),
    ]
    const assets = mapContentsToMediaAssets(items, REPO)
    expect(assets.map((a) => a.name)).toEqual(['20260305-b-y.png', '20260101-a-x.png'])
  })

  it('空配列は空配列を返す', () => {
    expect(mapContentsToMediaAssets([], REPO)).toEqual([])
  })
})

describe('formatMediaSize', () => {
  it('1024 未満はバイト表示', () => {
    expect(formatMediaSize(0)).toBe('0 B')
    expect(formatMediaSize(512)).toBe('512 B')
  })

  it('KB は 10 未満で小数第1位、10 以上で整数', () => {
    expect(formatMediaSize(1536)).toBe('1.5 KB')
    expect(formatMediaSize(20 * 1024)).toBe('20 KB')
  })

  it('MB は 10 未満で小数第1位、10 以上で整数', () => {
    expect(formatMediaSize(Math.round(2.5 * 1024 * 1024))).toBe('2.5 MB')
    expect(formatMediaSize(42 * 1024 * 1024)).toBe('42 MB')
  })

  it('不正値は空文字', () => {
    expect(formatMediaSize(-1)).toBe('')
    expect(formatMediaSize(NaN)).toBe('')
  })
})
