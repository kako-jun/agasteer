// #226: この barrel は責務別モジュールへの薄い再輸出だけを担う。
// consumers（keyboard-nav / pane-actions-factory / app-state）と
// git.test.ts が `./actions/git` 直パスに依存しているため、公開 API と
// import パスを不変に保つのが唯一の目的。実体は下記モジュールにある:
//   - git-push.ts       … pushToGitHub / PushToGitHubOptions（+ orphan 観測・世代ガード）
//   - git-pull.ts       … pullFromGitHub / runPendingRepoSyncIfIdle
//   - git-orphan.ts     … observeOrphanPush（#235 遅延結果観測の状態機械）
//   - git-connection.ts … handleTestConnection
export { pushToGitHub, type PushToGitHubOptions } from './git-push'
export { pullFromGitHub } from './git-pull'
export { handleTestConnection } from './git-connection'
