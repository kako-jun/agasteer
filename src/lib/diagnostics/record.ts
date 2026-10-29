/**
 * バグレポート用診断ログ（#317）: 記録の入口
 *
 * 明示的に呼んだ出来事だけを記録する（console.* の自動取り込みはしない:
 * ノートのタイトル等が混ざり「記録しないもの」を保証できなくなるため）。
 * 同期呼び出し・戻り値なし・例外を投げない。IndexedDB への書き込みは裏で進む。
 */
import { buildEntry, type DiagKind, type DiagData } from './schema'
import { appendDiagEntry } from './log-store'

export function recordDiag<K extends DiagKind>(kind: K, data: DiagData<K>): void {
  try {
    const entry = buildEntry(kind, data as Record<string, unknown>, Date.now())
    if (entry) {
      appendDiagEntry(entry).catch((e) => console.warn('diagnostics: append failed', e))
    }
  } catch (e) {
    console.warn('diagnostics: record failed', e)
  }
}
