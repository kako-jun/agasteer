/**
 * バグレポート用診断ログ（#317）: 切り捨て・整形（純粋層）
 */
import type { DiagEntry } from './schema'

/** 保持件数の上限 */
export const MAX_ENTRIES = 300
/** 合計サイズの上限（JSON 化した文字数の概算。厳密なバイト数ではない） */
export const MAX_TOTAL_BYTES = 200 * 1024

function entrySize(e: DiagEntry): number {
  return JSON.stringify({ at: e.at, kind: e.kind, data: e.data }).length
}

/**
 * 古い順に切り捨てて上限内に収める。入力は時刻の昇順（古い→新しい）。
 * 新しい側を優先して残し、結果も昇順で返す。
 */
export function trimEntries(entries: readonly DiagEntry[]): DiagEntry[] {
  const kept: DiagEntry[] = []
  let total = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    if (kept.length >= MAX_ENTRIES) break
    const size = entrySize(entries[i])
    if (total + size > MAX_TOTAL_BYTES) break
    total += size
    kept.push(entries[i])
  }
  return kept.reverse()
}

/** コピー用の1行: ISO時刻 種別 key=value ... */
export function formatEntry(e: DiagEntry): string {
  const pairs = Object.entries(e.data).map(([k, v]) => `${k}=${v === null ? 'null' : String(v)}`)
  return [new Date(e.at).toISOString(), e.kind, ...pairs].join(' ')
}

export interface DiagSummary {
  count: number
  /** 最古・最新の epoch ms（0件のとき null） */
  from: number | null
  to: number | null
}

export function summarize(entries: readonly DiagEntry[]): DiagSummary {
  if (entries.length === 0) return { count: 0, from: null, to: null }
  return { count: entries.length, from: entries[0].at, to: entries[entries.length - 1].at }
}

/** UA 文字列を「ブラウザ / OS」程度に要約する（端末固有の細部は落とす） */
export function summarizeUserAgent(ua: string): string {
  // 'Unknown OS' / 'Unknown browser' は i18n 対象外: 開発者が読む診断値で、
  // 端末固有情報を含まない固定語彙のため
  let os = 'Unknown OS'
  if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Unknown browser'
  const m =
    /(Edg|OPR|Firefox|FxiOS|CriOS)\/(\d+)/.exec(ua) ??
    /(Chrome)\/(\d+)/.exec(ua) ??
    /Version\/(\d+).*Safari/.exec(ua)
  if (m) {
    if (m.length === 2) browser = `Safari ${m[1]}`
    else {
      const names: Record<string, string> = {
        Edg: 'Edge',
        OPR: 'Opera',
        FxiOS: 'Firefox',
        CriOS: 'Chrome',
      }
      browser = `${names[m[1]] ?? m[1]} ${m[2]}`
    }
  }
  return `${browser} / ${os}`
}

/** コピー・プレビュー用の全文 */
export function formatReport(
  entries: readonly DiagEntry[],
  meta: { appVersion: string; device: string }
): string {
  const lines = [
    `Agasteer diagnostic log`,
    `app: ${meta.appVersion}`,
    `device: ${meta.device}`,
    `entries: ${entries.length}`,
    '',
    ...entries.map(formatEntry),
  ]
  return lines.join('\n')
}
