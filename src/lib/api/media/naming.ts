/**
 * メディアファイル命名・raw URL 構築（純粋層）
 *
 * メディアリポ名・ファイル名・raw URL の生成とパース。
 * fetch・settings・IO に触れない（sha256Hex は WebCrypto を使うが入出力のみ。
 * `github/sha.ts` の calculateGitBlobSha と同じ扱い）。(#242)
 */

/** メディアリポの suffix。notes リポ名に付けて `{owner}/{repo}-media` を作る */
export const MEDIA_REPO_SUFFIX = '-media'

/**
 * raw URL に埋め込むブランチ名。
 * `POST /user/repos`（auto_init: true）で作られる default branch を想定する。
 * 取得側（fetchMedia）は Contents API の default branch を使うため、
 * この値は URL の見た目上の識別子であり取得可否には影響しない。
 */
export const MEDIA_BRANCH = 'main'

/**
 * notes リポのフルネームからメディアリポのフルネームを作る
 * 例: "kako-jun/notes" -> "kako-jun/notes-media"
 */
export function getMediaRepoFullName(notesRepoName: string): string {
  return `${notesRepoName}${MEDIA_REPO_SUFFIX}`
}

/**
 * notes リポのフルネームからメディアリポの短縮名（owner なし）を作る
 * `POST /user/repos` の `name` パラメータ用。
 * 例: "kako-jun/notes" -> "notes-media"
 */
export function getMediaRepoShortName(notesRepoName: string): string {
  const slashIndex = notesRepoName.indexOf('/')
  const repo = slashIndex >= 0 ? notesRepoName.slice(slashIndex + 1) : notesRepoName
  return `${repo}${MEDIA_REPO_SUFFIX}`
}

/**
 * ArrayBuffer の SHA-256 を hex 文字列で返す（内容アドレス用）
 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * ローカル日付を YYYYMMDD 形式にする
 */
export function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/** サニタイズ後の base 名の最大長 */
const MAX_BASE_NAME_LENGTH = 40

/**
 * 拡張子を小文字で取り出す（ドットなし）。拡張子がなければ空文字。
 */
export function getMediaExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

/**
 * 元ファイル名（拡張子除く）を URL セーフな base 名にサニタイズする。
 *
 * raw URL にエンコードなしでそのまま埋め込むため [A-Za-z0-9_-] に制限する。
 * 一意性はファイル名中の hash8 が担保するので、非 ASCII 名が潰れても衝突しない。
 */
export function sanitizeMediaBaseName(originalName: string): string {
  const withoutExt = originalName.replace(/\.[^.]*$/, '')
  const sanitized = withoutExt
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_BASE_NAME_LENGTH)
    .replace(/^-+|-+$/g, '')
  return sanitized || 'file'
}

/**
 * 確定ファイル名を組み立てる: `{YYYYMMDD}-{hash8}-{sanitized名}.{ext}`
 * 内容 SHA-256 の先頭 8 桁を含むため、同日・同内容なら同名になる（dedup 用）。
 * 拡張子がない場合は末尾ドットを付けない（アップロード対象は validateMedia が
 * 拡張子必須で弾くが、純粋層として不正なファイル名を作らない）。
 */
export function buildMediaFileName(date: Date, sha256HexStr: string, originalName: string): string {
  const ext = getMediaExtension(originalName)
  const base = sanitizeMediaBaseName(originalName)
  const suffix = ext ? `.${ext}` : ''
  return `${formatDateYYYYMMDD(date)}-${sha256HexStr.slice(0, 8)}-${base}${suffix}`
}

/**
 * 確定 raw URL を組み立てる
 */
export function buildRawMediaUrl(mediaRepoFullName: string, fileName: string): string {
  return `https://raw.githubusercontent.com/${mediaRepoFullName}/${MEDIA_BRANCH}/${fileName}`
}

export interface ParsedRawMediaUrl {
  /** `owner/repo` 形式 */
  repoFullName: string
  branch: string
  /** リポルートからのパス（メディアはルート直下のファイル名） */
  path: string
}

/**
 * raw URL から owner/repo/branch/path を取り出す。raw URL でなければ null。
 */
export function parseRawMediaUrl(url: string): ParsedRawMediaUrl | null {
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url)
  if (!match) return null
  return {
    repoFullName: `${match[1]}/${match[2]}`,
    branch: match[3],
    path: match[4],
  }
}
