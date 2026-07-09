/**
 * バイナリ ↔ Base64 変換（純粋層）
 *
 * ArrayBuffer と Base64 の相互変換。fetch・settings・IO に触れない。
 * 既存 `github/encoding.ts` の encodeContent は TextEncoder ベースの
 * テキスト専用のため、メディア用のバイナリ安全な変換をここに新設する（#242）。
 */

/**
 * String.fromCharCode に一度に渡す最大バイト数。
 * 引数展開はコールスタックを消費するため、大きなバッファはチャンク分割する。
 */
const CHUNK_SIZE = 0x8000

/**
 * ArrayBuffer を Base64 エンコード（バイナリ安全）
 */
export function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
