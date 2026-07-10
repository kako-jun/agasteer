/**
 * プレビューのメディア表示解決・純粋層のテスト（#244）
 *
 * URL 検出（parseRawMediaUrl 受理のみ）・種別振り分け・MIME 解決・ファイル名抽出。
 * 副作用層（resolveMedia 呼び出し・DOM 差し替え・Blob URL 管理）は node 環境では
 * 対象外（実ブラウザでの golden path 確認に委ねる）。
 */

import { describe, expect, it } from 'vitest'

import {
  classifyPreviewMediaKind,
  previewMediaMimeType,
  previewMediaFileName,
} from './media-resolve'
import { ALLOWED_MEDIA_EXTENSIONS } from '../api/media/validation'

const MEDIA_BASE = 'https://raw.githubusercontent.com/kako-jun/notes-media/main'

describe('classifyPreviewMediaKind', () => {
  it('classifies image extensions as image', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']) {
      expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-photo.${ext}`)).toBe('image')
    }
  })

  it('classifies video extensions as video', () => {
    for (const ext of ['mp4', 'webm']) {
      expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-clip.${ext}`)).toBe('video')
    }
  })

  it('classifies audio extensions as audio', () => {
    for (const ext of ['mp3', 'm4a', 'ogg', 'wav']) {
      expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-voice.${ext}`)).toBe('audio')
    }
  })

  it('classifies zip as download', () => {
    expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-bundle.zip`)).toBe('download')
  })

  it('falls back to download for unknown extensions on valid media URLs', () => {
    expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-data.bin`)).toBe('download')
  })

  it('classifies uppercase extensions case-insensitively', () => {
    expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-photo.PNG`)).toBe('image')
  })

  it('rejects URLs that parseRawMediaUrl does not accept', () => {
    for (const url of [
      // -media サフィックスなしのリポ（任意リポへの差し替えを封じる）
      'https://raw.githubusercontent.com/kako-jun/notes/main/photo.png',
      // main 以外のブランチ
      'https://raw.githubusercontent.com/kako-jun/notes-media/dev/photo.png',
      // ルート直下以外（複数セグメント）
      `${MEDIA_BASE}/dir/photo.png`,
      // raw.githubusercontent.com 以外のホスト
      'https://example.com/kako-jun/notes-media/main/photo.png',
      // 通常の外部リンク
      'https://example.com/page',
      // 内部リンク
      '#priority:leaf1:3',
    ]) {
      expect(classifyPreviewMediaKind(url)).toBeNull()
    }
  })

  it('rejects raw URLs with a query or fragment', () => {
    // parseRawMediaUrl はルート直下 1 セグメントのみ受理（クエリ・フラグメント不可）
    expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-photo.png?token=x`)).toBeNull()
    expect(classifyPreviewMediaKind(`${MEDIA_BASE}/20260710-abcd1234-photo.png#f`)).toBeNull()
  })
})

describe('previewMediaMimeType', () => {
  it('maps known extensions to MIME types', () => {
    expect(previewMediaMimeType('a.png')).toBe('image/png')
    expect(previewMediaMimeType('a.jpg')).toBe('image/jpeg')
    expect(previewMediaMimeType('a.svg')).toBe('image/svg+xml')
    expect(previewMediaMimeType('a.mp4')).toBe('video/mp4')
    expect(previewMediaMimeType('a.webm')).toBe('video/webm')
    expect(previewMediaMimeType('a.mp3')).toBe('audio/mpeg')
    expect(previewMediaMimeType('a.m4a')).toBe('audio/mp4')
    expect(previewMediaMimeType('a.wav')).toBe('audio/wav')
    expect(previewMediaMimeType('a.zip')).toBe('application/zip')
  })

  it('falls back to octet-stream for unknown or missing extensions', () => {
    expect(previewMediaMimeType('a.bin')).toBe('application/octet-stream')
    expect(previewMediaMimeType('noext')).toBe('application/octet-stream')
  })

  it('resolves MIME from a full raw URL (Blob 生成はフル URL を渡す)', () => {
    expect(previewMediaMimeType(`${MEDIA_BASE}/20260710-abcd1234-clip.mp4`)).toBe('video/mp4')
  })

  it('maps every allowed media extension to a specific MIME type (ホワイトリスト追加時の漏れ検出)', () => {
    for (const ext of ALLOWED_MEDIA_EXTENSIONS) {
      expect(previewMediaMimeType(`file.${ext}`), `MIME 対応表に拡張子がない: ${ext}`).not.toBe(
        'application/octet-stream'
      )
    }
  })
})

describe('previewMediaFileName', () => {
  it('extracts the file name from a valid media URL', () => {
    expect(previewMediaFileName(`${MEDIA_BASE}/20260710-abcd1234-photo.png`)).toBe(
      '20260710-abcd1234-photo.png'
    )
  })

  it('returns the input unchanged for non-media URLs', () => {
    expect(previewMediaFileName('https://example.com/page')).toBe('https://example.com/page')
  })
})
