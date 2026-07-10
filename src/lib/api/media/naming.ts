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

/** owner の安全文字クラス（GitHub ユーザー名/組織名: 英数とハイフン、先頭末尾は英数） */
const OWNER_NAME_PATTERN = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'

/**
 * repo の安全文字クラス。GitHub のリポジトリ名は owner と違い `.`・`_` も合法。
 * `..` を含む名前もあり得るが、`-media` サフィックス必須のため
 * セグメント全体が `..` にはならず、パストラバーサルは成立しない。
 */
const REPO_NAME_PATTERN = '[A-Za-z0-9._-]+'

/**
 * メディア raw URL の厳格パターン。
 * パース結果は認証付き fetch の宛先組み立てに使うため、
 * buildRawMediaUrl が生成する URL の構造だけを受ける:
 * - repo は `-media` サフィックス必須（本機能が生成する URL の構造的不変条件。
 *   任意リポへの認証付き fetch を封じる）
 * - branch は `main` 固定（生成側が MEDIA_BRANCH 固定のため）
 * - path はリポルート直下の 1 セグメントのみ（スラッシュ・クエリ・フラグメント不可）
 */
/** ファイル名（リポルート直下 1 セグメント）の安全文字クラス。parse / scan で共有 */
const MEDIA_FILE_NAME_PATTERN = '[A-Za-z0-9._-]+'

const RAW_MEDIA_URL_PATTERN = new RegExp(
  `^https://raw\\.githubusercontent\\.com/(${OWNER_NAME_PATTERN})/(${REPO_NAME_PATTERN}${MEDIA_REPO_SUFFIX})/${MEDIA_BRANCH}/(${MEDIA_FILE_NAME_PATTERN})$`
)

/**
 * 本文スキャン用の非アンカー・global 版（#250 孤児検出）。
 * parse と同じサブパターンから組み立て、文字集合の乖離を構造的に防ぐ。
 *
 * 末尾がファイル名の安全文字クラスで自然に途切れるため、散文中に素の URL を
 * 書いて直後に日本語・記号（`。` `、` 全角文字・括弧・引用符など）が続いても
 * URL 部分だけが正しく切り出される。ASCII の `.` `-` `_` はクラス内のため
 * 文末ピリオド等が巻き込まれ得るが、確定ファイル名は必ず拡張子の英数字で
 * 終わる（sanitizeMediaBaseName + ext）ので、呼び出し側で末尾の `[._-]` を
 * 落としてから parse すれば誤って参照を取りこぼさない。
 */
export const RAW_MEDIA_URL_SCAN_PATTERN = new RegExp(
  `https://raw\\.githubusercontent\\.com/${OWNER_NAME_PATTERN}/${REPO_NAME_PATTERN}${MEDIA_REPO_SUFFIX}/${MEDIA_BRANCH}/${MEDIA_FILE_NAME_PATTERN}`,
  'g'
)

/**
 * raw URL から owner/repo/branch/path を取り出す。
 * 本機能が生成するメディア raw URL の構造（上記パターン）でなければ null。
 */
export function parseRawMediaUrl(url: string): ParsedRawMediaUrl | null {
  const match = RAW_MEDIA_URL_PATTERN.exec(url)
  if (!match) return null
  const path = match[3]
  // 文字クラスだけでは `.`・`..` のようなドットのみのセグメントが通り得るため明示拒否する
  if (/^\.+$/.test(path)) return null
  return {
    repoFullName: `${match[1]}/${match[2]}`,
    branch: MEDIA_BRANCH,
    path,
  }
}
