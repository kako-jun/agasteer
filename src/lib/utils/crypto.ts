/**
 * トークン暗号化ユーティリティ
 *
 * GitHub tokenをLocalStorageに保存する際、AES-GCMで暗号化する。
 * 暗号鍵はデバイス固有の情報から派生させる（PBKDF2）。
 *
 * 注意: ブラウザのLocalStorageに保存する以上、完全な秘密保持は不可能だが、
 * 平文保存よりも以下の点で優れている:
 * - ブラウザの開発者ツールでtokenが直接見えない
 * - localStorage のダンプやエクスポートでtokenが漏洩しない
 * - XSS攻撃でlocalStorageを読み取られても即座にtokenを取得されない
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM'
const KEY_DERIVATION_ALGORITHM = 'PBKDF2'
const IV_LENGTH = 12 // AES-GCM recommended IV length
const SALT_LENGTH = 16
const KEY_LENGTH = 256
const ITERATIONS = 100000

/**
 * デバイス固有のシードを生成
 * 完全にユニークである必要はないが、localStorage のダンプだけでは復号できないようにする
 */
function getDeviceSeed(): string {
  // origin（プロトコル+ホスト+ポート）を基本シードとして使用
  // これにより、同一サイトでのみ復号可能
  const origin = globalThis.location?.origin || 'agasteer-default'
  // User-Agent のハッシュ的な要素を加味（デバイス間での共有防止）
  const ua = globalThis.navigator?.userAgent || 'unknown-agent'
  return `agasteer-token-key:${origin}:${ua.length}`
}

/**
 * シードから暗号鍵を派生（PBKDF2）
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const seed = encoder.encode(getDeviceSeed())

  const keyMaterial = await crypto.subtle.importKey('raw', seed, KEY_DERIVATION_ALGORITHM, false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    {
      name: KEY_DERIVATION_ALGORITHM,
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * トークンを暗号化する
 * @returns Base64エンコードされた暗号文（salt + iv + ciphertext）
 */
export async function encryptToken(plainToken: string): Promise<string> {
  if (!plainToken) return ''

  // Web Crypto API が利用できない場合（古いブラウザ、HTTP環境等）はフォールバック
  if (!crypto?.subtle) {
    console.warn('Web Crypto API not available, using obfuscation fallback')
    return obfuscateToken(plainToken)
  }

  try {
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const key = await deriveKey(salt)

    const encrypted = await crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encoder.encode(plainToken)
    )

    // salt + iv + ciphertext を結合してBase64エンコード
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
    combined.set(salt, 0)
    combined.set(iv, salt.length)
    combined.set(new Uint8Array(encrypted), salt.length + iv.length)

    return 'enc:' + btoa(String.fromCharCode(...combined))
  } catch (error) {
    console.error('Token encryption failed, using obfuscation fallback:', error)
    return obfuscateToken(plainToken)
  }
}

/**
 * 暗号化されたトークンを復号する
 * @param encryptedToken Base64エンコードされた暗号文
 * @returns 平文トークン
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken) return ''

  // 平文トークン（enc: プレフィックスなし）はそのまま返す（後方互換性）
  if (!encryptedToken.startsWith('enc:') && !encryptedToken.startsWith('obf:')) {
    return encryptedToken
  }

  // 難読化フォールバック
  if (encryptedToken.startsWith('obf:')) {
    return deobfuscateToken(encryptedToken)
  }

  // Web Crypto API が利用できない場合
  if (!crypto?.subtle) {
    console.warn('Web Crypto API not available, cannot decrypt token')
    return ''
  }

  try {
    const data = Uint8Array.from(atob(encryptedToken.slice(4)), (c) => c.charCodeAt(0))

    const salt = data.slice(0, SALT_LENGTH)
    const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    const ciphertext = data.slice(SALT_LENGTH + IV_LENGTH)

    const key = await deriveKey(salt)

    const decrypted = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      ciphertext
    )

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Token decryption failed:', error)
    // 復号失敗 = 別デバイスで暗号化された or データ破損
    // 空文字を返してユーザーに再入力を促す
    return ''
  }
}

/**
 * 暗号化されたトークンかどうかを判定
 */
export function isEncryptedToken(token: string): boolean {
  return token.startsWith('enc:') || token.startsWith('obf:')
}

// ============================================
// フォールバック: 簡易難読化（Web Crypto API非対応環境用）
// ============================================

/**
 * 簡易難読化（XORベース）
 * セキュリティ的には弱いが、平文よりはまし
 */
export function obfuscateToken(token: string): string {
  const key = getDeviceSeed()
  const result: number[] = []
  for (let i = 0; i < token.length; i++) {
    result.push(token.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return 'obf:' + btoa(String.fromCharCode(...result))
}

function deobfuscateToken(obfuscated: string): string {
  try {
    const data = atob(obfuscated.slice(4))
    const key = getDeviceSeed()
    const result: string[] = []
    for (let i = 0; i < data.length; i++) {
      result.push(String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length)))
    }
    return result.join('')
  } catch {
    return ''
  }
}
