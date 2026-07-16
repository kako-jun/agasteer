# ADR-0001: GitHubをSSoT（Single Source of Truth）とする

- **日付**: 2025-11（決定時点のコミットは2025-11-22）（遡及記録: #228対応、2026-07-16）
- **ステータス**: Accepted

## コンテキスト

元々、アプリ起動時にIndexedDBへ保存済みのノート・リーフを読み込み、その後GitHubからPullする実装になっていた。この場合、起動直後の画面には「前回終了時点のIndexedDBの内容」が表示され、Pullが完了すると（差分があれば）GitHubの内容に置き換わる。

これにより、GitHubとIndexedDBのどちらが「正」のデータなのかが曖昧になっていた。具体的には以下の問題があった。

- 別デバイス・別セッションでPushされた変更がある場合、起動直後は古いIndexedDBの内容が一瞬表示される
- IndexedDBのデータがいつの時点のものか（Pull由来か、ローカル編集由来か）が不明瞭
- 「データが失われた」ように見えるバグ（Pull後に古いIndexedDBの残骸が残る等）の温床になっていた

## 決定

**GitHubを唯一の正（Single Source of Truth）とし、IndexedDBは一時キャッシュとしてのみ扱う。**

具体的な変更（commit `73f41cf` "Fix data persistence architecture: GitHub as single source of truth"）:

- アプリ起動時のIndexedDB読み込みを廃止する（`loadNotes()`/`loadLeaves()`を起動シーケンスから削除）
- 起動時は必ず最初にPullを実行し、GitHubから最新データを取得する
- Pull成功時は毎回、IndexedDBを全削除してからGitHub由来のデータで全再構築する（前回終了時のIndexedDBデータは決して使われない）
- 初回Pullが完了するまで、画面にノート・リーフを表示しない（`isOperationsLocked = true`で操作をロック）
- LocalStorage（設定情報）はGitHubに含まれない別ドメインとして明確に分離する

## 却下した代替案

- **IndexedDBファースト＋GitHub同期（従来方式）**: 起動時にIndexedDBを先に表示し、Pull完了後に差分があれば置き換える方式。体感の起動速度は良いが、「今表示されているデータはどの時点のものか」が常に曖昧になる問題を再発させるため却下した。
- **他バックエンド（Firebase等の専用サーバー）の導入**: データ整合性の管理はサーバー側で楽になるが、「サーバーレス・追加インフラ不要」というプロジェクトの設計哲学（architecture.md参照）と相容れないため検討の対象外とした。

## 結果

- 初回Pullが完了するまでデータが一切表示されないという制約が生まれた（オフライン時や低速回線ではブランク画面が続く）
- 一方で「表示されているデータは常にGitHub由来である」という単純さを獲得し、正本の曖昧さに起因するバグのクラスを消し去った
- IndexedDBは「Pullのたびに使い捨てられるキャッシュ」という位置づけが明文化され、以後のキャッシュ関連の実装判断（例: Pull失敗時の部分キャッシュ保護 `createBackup`/`restoreFromBackup`）もこの前提の上に積み上げられている
