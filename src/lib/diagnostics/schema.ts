/**
 * バグレポート用診断ログ（#317）: 許可リスト（純粋層）
 *
 * 記録してよいのは、この表に載っている種別とキーだけ。値も型で縛る
 * （自由文字列は enum 以外受け付けない）ため、ノート本文・タイトル・パス・
 * 認証トークン・リポ名・ユーザー名は、呼び出し側が間違えても保存できない。
 *   - sha:  16進（7〜64桁）または null。SHA は全桁で記録してよい
 *   - int:  有限の整数
 *   - bool: 真偽値
 *   - iso:  ISO 8601 風の日時文字列
 *   - 文字列配列: その中のどれかと完全一致する値だけ
 */

export type FieldType = 'sha' | 'int' | 'bool' | 'iso' | readonly string[]

type FieldValue<T extends FieldType> = T extends 'sha'
  ? string | null
  : T extends 'int'
    ? number
    : T extends 'bool'
      ? boolean
      : T extends 'iso'
        ? string
        : T extends readonly (infer U)[]
          ? U
          : never

export const DIAG_SCHEMA = {
  /** Push 成功（commitSha=新コミット、parentSha=Push 開始時に読んだ親） */
  'push-success': {
    commitSha: 'sha',
    parentSha: 'sha',
    stamp: 'int',
    noChanges: 'bool',
  },
  /** preflight の stale 検出（判定そのものの値） */
  'stale-detected': { remoteSha: 'sha', localSha: 'sha' },
  /** stale 直後の HEAD 再取得（記録のみ。判定には使わない） */
  'stale-recheck': {
    status: ['success', 'failed'],
    headSha: 'sha',
    sameAsRemote: 'bool',
  },
  /** stale 時のリモート HEAD コミットの親と日時 */
  'stale-remote-commit': { headSha: 'sha', parentSha: 'sha', commitDate: 'iso' },
  /** ref を PATCH した直後に読み直した値との一致確認 */
  'ref-verify': {
    pushedSha: 'sha',
    refSha: 'sha',
    match: 'bool',
    httpStatus: 'int',
  },
  /** pushInFlightAt の設定 */
  'inflight-set': { stamp: 'int' },
  /** pushInFlightAt の解除 */
  'inflight-clear': {
    stamp: 'int',
    reason: ['response', 'http-error', 'orphan-settled', 'orphan-rejected'],
  },
  /** Push 応答タイムアウト（UI をあきらめた） */
  'push-timeout': { stamp: 'int', timeoutMs: 'int' },
  /** タイムアウト後の orphan Push が settle した */
  'orphan-settled': {
    stamp: 'int',
    outcome: ['follow', 'verify-align', 'verify-skip', 'failure', 'rejected', 'repo-switched'],
    commitSha: 'sha',
    elapsedMs: 'int',
  },
  /** rehydrate での lastKnownCommitSha 差し替え */
  'rehydrate-sha': { oldSha: 'sha', newSha: 'sha' },
  /** 衝突ダイアログの表示 */
  'conflict-dialog': {
    dialogKind: ['stale-push', 'pull-dirty', 'startup-dirty', 'push-hang'],
    localSha: 'sha',
    remoteSha: 'sha',
  },
} as const satisfies Record<string, Record<string, FieldType>>

export type DiagKind = keyof typeof DIAG_SCHEMA

export type DiagData<K extends DiagKind> = {
  [F in keyof (typeof DIAG_SCHEMA)[K]]?: (typeof DIAG_SCHEMA)[K][F] extends FieldType
    ? FieldValue<(typeof DIAG_SCHEMA)[K][F]>
    : never
}

/** 保存される1件分 */
export interface DiagEntry {
  /** IndexedDB の自動採番キー（追加前は無い） */
  id?: number
  /** 記録時刻（epoch ms） */
  at: number
  kind: DiagKind
  /** 許可リストを通過した値だけ */
  data: Record<string, string | number | boolean | null>
}

const SHA_RE = /^[0-9a-f]{7,64}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/

function sanitizeValue(
  type: FieldType,
  v: unknown
): { ok: true; value: string | number | boolean | null } | { ok: false } {
  if (type === 'sha') {
    if (v === null) return { ok: true, value: null }
    return typeof v === 'string' && SHA_RE.test(v) ? { ok: true, value: v } : { ok: false }
  }
  if (type === 'int') {
    return typeof v === 'number' && Number.isFinite(v)
      ? { ok: true, value: Math.trunc(v) }
      : { ok: false }
  }
  if (type === 'bool') return typeof v === 'boolean' ? { ok: true, value: v } : { ok: false }
  if (type === 'iso') {
    return typeof v === 'string' && ISO_RE.test(v) ? { ok: true, value: v } : { ok: false }
  }
  return typeof v === 'string' && type.includes(v) ? { ok: true, value: v } : { ok: false }
}

/**
 * 許可リストを通した記録を作る。未知の種別は null（保存しない）。
 * 定義外のキー・型や値が合わないキーは黙って捨てる。
 */
export function buildEntry(
  kind: string,
  data: Record<string, unknown>,
  at: number
): DiagEntry | null {
  if (!Object.prototype.hasOwnProperty.call(DIAG_SCHEMA, kind)) return null
  const spec = DIAG_SCHEMA[kind as DiagKind] as Record<string, FieldType>
  const out: DiagEntry['data'] = {}
  for (const key of Object.keys(spec)) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const r = sanitizeValue(spec[key], data[key])
    if (r.ok) out[key] = r.value
  }
  return { at, kind: kind as DiagKind, data: out }
}
