/**
 * メディアライブラリ純粋層のテスト（#250・#258 で Trees API へ切替）
 *
 * 対象: treeItemToMediaAsset / mapTreeToMediaAssets / formatMediaSize
 * fetch・IO には触れない純粋関数なので node 環境で完結する。
 */

import { describe, expect, it } from 'vitest'
import {
  treeItemToMediaAsset,
  mapTreeToMediaAssets,
  collectMediaReferenceUrls,
  formatMediaSize,
  type GitTreeItem,
} from './library'
// 型のみの import は実行時に消えるが、コンパイル時（svelte-check）に型設計を縛る
import type { WorldType, View } from '../../types'
import ja from '../../i18n/locales/ja.json'
import en from '../../i18n/locales/en.json'

const REPO = 'owner/repo-media'

function item(overrides: Partial<GitTreeItem> = {}): GitTreeItem {
  return {
    path: '20260101-abcd1234-photo.png',
    size: 1234,
    sha: 'sha-1',
    type: 'blob',
    ...overrides,
  }
}

describe('treeItemToMediaAsset', () => {
  it('対応形式の blob を MediaAsset に変換し raw URL を再構成する', () => {
    const asset = treeItemToMediaAsset(item(), REPO)
    expect(asset).toEqual({
      name: '20260101-abcd1234-photo.png',
      path: '20260101-abcd1234-photo.png',
      size: 1234,
      sha: 'sha-1',
      rawUrl: 'https://raw.githubusercontent.com/owner/repo-media/main/20260101-abcd1234-photo.png',
    })
  })

  it('blob 以外（tree=ディレクトリ・commit=submodule）は除外する（null）', () => {
    expect(treeItemToMediaAsset(item({ type: 'tree' }), REPO)).toBeNull()
    expect(treeItemToMediaAsset(item({ type: 'commit' }), REPO)).toBeNull()
  })

  it('ネストしたパス（recursive で返る sub/dir 配下）は除外する（raw URL の1セグメント不変条件）', () => {
    expect(treeItemToMediaAsset(item({ path: 'sub/photo.png' }), REPO)).toBeNull()
  })

  it('size が無い blob は 0 とする（Trees API は稀に size を省く想定外応答への防御）', () => {
    expect(treeItemToMediaAsset(item({ size: undefined }), REPO)?.size).toBe(0)
  })

  it('.gitkeep（拡張子なし）は除外する（null）', () => {
    expect(treeItemToMediaAsset(item({ path: '.gitkeep' }), REPO)).toBeNull()
  })

  it('対応形式外（例: txt）は除外する（null）', () => {
    expect(treeItemToMediaAsset(item({ path: 'note.txt' }), REPO)).toBeNull()
  })

  it('動画・音声・zip は対応形式として通す', () => {
    for (const path of ['a.mp4', 'b.mp3', 'c.zip']) {
      expect(treeItemToMediaAsset(item({ path }), REPO)).not.toBeNull()
    }
  })

  it('大文字拡張子（.PNG / .MP4 / .ZIP）も通す（getMediaExtension が小文字化する）', () => {
    for (const path of ['X.PNG', 'V.MP4', 'A.ZIP']) {
      expect(treeItemToMediaAsset(item({ path }), REPO)).not.toBeNull()
    }
  })
})

describe('mapTreeToMediaAssets', () => {
  it('非対応/非blob/ネストを除外し、名前の降順（新しい順）で並べる', () => {
    const items: GitTreeItem[] = [
      item({ path: '20260101-a-x.png' }),
      item({ path: '.gitkeep' }),
      item({ path: 'sub', type: 'tree' }),
      item({ path: 'sub/20260401-c-z.png' }),
      item({ path: '20260305-b-y.png' }),
      item({ path: 'readme.md' }),
    ]
    const assets = mapTreeToMediaAssets(items, REPO)
    expect(assets.map((a) => a.name)).toEqual(['20260305-b-y.png', '20260101-a-x.png'])
  })

  it('空配列は空配列を返す', () => {
    expect(mapTreeToMediaAssets([], REPO)).toEqual([])
  })
})

describe('collectMediaReferenceUrls（#250 孤児検出）', () => {
  const URL_A = 'https://raw.githubusercontent.com/owner/repo-media/main/20260101-aa-x.png'
  const URL_B = 'https://raw.githubusercontent.com/owner/repo-media/main/20260102-bb-y.mp4'

  it('画像記法・リンク記法の両方から raw メディア URL を集める', () => {
    const refs = collectMediaReferenceUrls([`text ![x](${URL_A}) more`, `[clip](${URL_B})`])
    expect(refs).toEqual(new Set([URL_A, URL_B]))
  })

  it('同一 URL の重複参照は 1 つに畳まれ、複数リーフ横断で集まる', () => {
    const refs = collectMediaReferenceUrls([`![a](${URL_A}) ![b](${URL_A})`, `also ${URL_A}`])
    expect(refs).toEqual(new Set([URL_A]))
  })

  it('-media リポ以外の raw URL・構造不正は参照として数えない（parseRawMediaUrl 検証）', () => {
    const refs = collectMediaReferenceUrls([
      // 通常リポ（-media でない）
      '![x](https://raw.githubusercontent.com/owner/repo/main/a.png)',
      // main 以外のブランチ
      '![x](https://raw.githubusercontent.com/owner/repo-media/dev/a.png)',
      // ネストしたパス（1 セグメント不変条件）
      '![x](https://raw.githubusercontent.com/owner/repo-media/main/sub/a.png)',
      // raw 以外のホスト
      '![x](https://example.com/a.png)',
    ])
    expect(refs.size).toBe(0)
  })

  it('記法の閉じ括弧・引用符・空白で URL が正しく切れる', () => {
    const refs = collectMediaReferenceUrls([`<img src="${URL_A}"> and (${URL_B}) trailing`])
    expect(refs).toEqual(new Set([URL_A, URL_B]))
  })

  it('空配列・参照なし本文は空集合', () => {
    expect(collectMediaReferenceUrls([]).size).toBe(0)
    expect(collectMediaReferenceUrls(['plain text only']).size).toBe(0)
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
    'media.library.truncated',
    'media.library.orphan',
    'media.library.orphanHint',
    'media.library.orphanUnavailable',
    'media.library.notConfigured',
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
