/**
 * Git blob SHA 計算（純粋層）
 *
 * 文字列 → ハッシュの純粋関数。fetch・settings・IO に触れない。
 * github.ts から純移動（Phase 1）。振る舞いは不変。
 */

/**
 * Git blob形式のSHA-1を計算
 * Git仕様: sha1("blob " + UTF-8バイト数 + "\0" + content)
 */
export async function calculateGitBlobSha(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)
  const header = `blob ${contentBytes.length}\0`
  const headerBytes = encoder.encode(header)

  // headerとcontentを結合
  const data = new Uint8Array(headerBytes.length + contentBytes.length)
  data.set(headerBytes, 0)
  data.set(contentBytes, headerBytes.length)

  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
