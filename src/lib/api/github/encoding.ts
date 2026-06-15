/**
 * Base64 / UTF-8 エンコード変換（純粋層）
 *
 * 文字列 ↔ Base64 の純粋変換。fetch・settings・IO に触れない。
 * github.ts から純移動（Phase 1）。振る舞いは不変。
 */

/**
 * UTF-8テキストをBase64エンコード
 */
export function encodeContent(content: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(content)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary)
}

/**
 * Base64文字列をUTF-8テキストにデコード（改行は除去）
 */
export function decodeBase64ToString(base64: string): string {
  const clean = base64.replace(/\n/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}
