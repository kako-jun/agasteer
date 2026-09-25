/**
 * Svelteストア（互換性維持のための再エクスポート）
 *
 * #300: god-file化していた stores.svelte.ts（約930行）を関心ごとに分割した。
 * - core-state.svelte.ts    ... ノート/リーフ/アーカイブ/ペイン/同期フラグ等の $state 宣言
 * - dirty-tracking.ts       ... 差分検出・Pushスナップショット管理
 * - store-mutations.ts      ... ノート/リーフ更新・in-place field mutation ヘルパー
 * - persistence-effects.svelte.ts ... LocalStorage/IndexedDB永続化の $effect
 * - repo-switch-reset.ts    ... リポジトリ切替時の状態リセット
 *
 * `'../../../lib/stores/stores.svelte'` のように、stores/index.ts を経由せず
 * このファイルを直接 import している既存コード（footer コンポーネント等）や
 * このファイルを vi.mock している既存テストを壊さないよう、分割後の各モジュールを
 * まとめて re-export する。新規コードは stores/index.ts 経由（'$lib/stores'）で
 * import すること。
 */
export * from './core-state.svelte'
export * from './dirty-tracking'
export * from './store-mutations'
export * from './persistence-effects.svelte'
export * from './repo-switch-reset'
