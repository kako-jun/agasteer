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
// 型のみの import は実行時に消えるが、コンパイル時（svelte-check）に型設計を縛る
import type { WorldType, View } from '../../types'
import ja from '../../i18n/locales/ja.json'
import en from '../../i18n/locales/en.json'

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

  it('大文字拡張子（.PNG / .MP4 / .ZIP）も通す（getMediaExtension が小文字化する）', () => {
    for (const name of ['X.PNG', 'V.MP4', 'A.ZIP']) {
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

  it('単位の境界・丸め切替点', () => {
    expect(formatMediaSize(1023)).toBe('1023 B') // B の上端
    expect(formatMediaSize(1024)).toBe('1.0 KB') // KB の下端（小数第1位）
    expect(formatMediaSize(10240)).toBe('10 KB') // 10KB＝小数→整数の切替点
    expect(formatMediaSize(1048575)).toBe('1024 KB') // MB 直前は KB 表示のまま
    expect(formatMediaSize(1048576)).toBe('1.0 MB') // MB の下端
  })
})

describe('i18n キー整合（メディアライブラリ画面・#250）', () => {
  // 画面が参照する文言キー。ja/en 両方に string で存在することを縛る
  // （media-attach.test.ts の requiredKeys 方式に倣う）
  const requiredKeys = [
    'breadcrumbs.worldMedia',
    'media.library.title',
    'media.library.back',
    'media.library.loading',
    'media.library.empty',
    'media.library.loadFailed',
    'media.library.retry',
    'media.library.delete',
    'media.library.deleteConfirm',
    'media.library.deleted',
    'media.library.deleteFailed',
  ]

  function getByPath(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce<unknown>((cur, key) => (cur as Record<string, unknown> | undefined)?.[key], obj)
  }

  it.each([
    ['ja', ja],
    ['en', en],
  ])('%s: 画面文言キーが全て string で存在する', (name, locale) => {
    for (const key of requiredKeys) {
      expect(getByPath(locale, key), `${name}.json missing key: ${key}`).toBeTypeOf('string')
    }
  })
})

describe('型設計の回帰ガード（WorldType 3値化防止・#250）', () => {
  // 'media' は「World（Home/Archive）ではなく独立の View」という設計を型で固定する。
  // これらは svelte-check（npm run check）が検証する compile 時アサーション。
  // 実行時の expect は「テストが空でない」ことの担保にすぎない。

  // WorldType が 'home' | 'archive' の2値のまま（3値化したら下の網羅列挙が壊れる）
  const ALL_WORLD_TYPES = ['home', 'archive'] as const satisfies readonly WorldType[]
  // WorldType に値が増えると never へ落ちて型エラーになり、回帰を検出する
  const _worldExhaustive: Exclude<WorldType, (typeof ALL_WORLD_TYPES)[number]> extends never
    ? true
    : never = true

  // 'media' は WorldType の外（Exclude で 'media' が残る＝WorldType に含まれない）。
  // WorldType に 'media' を足すと never になり代入不能で壊れる
  const mediaIsNotWorld: Exclude<'media', WorldType> = 'media'
  // 'media' は View に含まれる（View から外すと never で代入不能）
  const mediaIsView: View = 'media'

  it("'media' は View だが WorldType ではない（型レベルで固定）", () => {
    void _worldExhaustive
    expect(ALL_WORLD_TYPES).toEqual(['home', 'archive'])
    expect(mediaIsNotWorld).toBe('media')
    expect(mediaIsView).toBe('media')
  })
})
