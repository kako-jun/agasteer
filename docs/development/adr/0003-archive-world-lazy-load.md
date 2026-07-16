# ADR-0003: ワールド（Archive）の遅延ロード

- **日付**: 2025-12（決定時点のコミットは2025-12-09）（遡及記録: #228対応、2026-07-16）
- **ステータス**: Accepted

## コンテキスト

Home（通常のノート・リーフ）に加えて、アーカイブ機能（Archive）を追加することになった。単純に実装するなら、Pull時にHomeとArchiveの両方を毎回取得すればよいが、Archiveは「普段は見ないが消したくないデータ」という性質上、データ量が増えるほど通常のPull（＝日常的に最も頻繁に実行される操作）が遅くなってしまう。

検索・統計などの機能もArchiveを含めるべきかという設計判断が付随した。

## 決定

**`WorldType`（'home' | 'archive'）を導入し、Archiveワールドは実際にユーザーがArchiveへ切り替えた時点で初めてPullする（遅延Pull）。**

commit `ed3c65f`（"feat: Add archive feature with lazy loading"）での主な変更:

- `WorldType = 'home' | 'archive'`を型として導入し、ペインごとに現在のワールドを保持する
- パス構造を`.agasteer/notes/`（Home）＋`.agasteer/archive/`（Archive）に分離する（旧`notes/`直下からの自動マイグレーションに対応）
- 通常のPull（起動時・Pullボタン・設定画面クローズ時）はHomeのみを対象とし、Archiveは対象外にする
- ユーザーがブレッドクラムのワールド切替UIでArchiveへ切り替えた瞬間に、初めてArchiveのPullを実行する（以降はキャッシュを再利用）
- 検索・統計機能は意図的にHome限定のままとする（Archiveは対象外）
- アーカイブ/リストア操作用のUI（フッターのアーカイブ/リストアボタン、確認モーダル）を追加する

## 却下した代替案

- **常に両方Pullする**: 実装はシンプルだが、Archiveのデータ量が増えるほど通常のPull（最も頻繁な操作）が遅くなる。Archiveは「普段は見ない」という利用パターンと相容れないため却下した。
- **Archiveを完全に別リポ/別ストレージに分離する**: メディア添付用の別リポ（`{owner}/{repo}-media`）のような分離パターンも検討したが、Archiveは同じ「ノート・リーフ」というデータモデルを共有しており、リポジトリを分けるほどの独立性はない。同一リポ内でのパス分離（`.agasteer/notes/` vs `.agasteer/archive/`）で十分と判断した。

## 結果

- 通常のPullはHomeのみを対象とするため、Archiveのデータ量に関わらず高速なまま維持される
- 一方で「検索・統計はHomeのみ」という制約が明文化され、ユーザーから見ると「アーカイブしたノートは検索に出てこない」という仕様上のトレードオフが生じる
- `WorldType`という概念は以後、ペイン単位のデータ取得ヘルパー（`getNotesForWorld`/`getLeavesForWorld`等、`stores/world-helpers.ts`）や、ADR-0002の左右対称設計とも組み合わさって、「ペイン×ワールド」の2軸でデータを扱う設計の基盤になった

## 追記（2026-01、検索アーカイブ対応）

その後、検索と統計はそれぞれ別コミットでArchive対応が行われた。

commit `a7de6bc`（"feat: 検索機能のアーカイブ対応を実装"、2026-01-13）で検索機能がArchive対応に拡張された。Archiveワールドがロード済み（ユーザーが一度Archiveに切り替えて遅延Pullが完了している）であれば、`archiveNotes`/`archiveLeaves`も検索対象に含める（`src/lib/utils/search.svelte.ts`）。

約1時間後のcommit `7225ce5`（"feat: アーカイブ切り替え時に統計表示で進捗を可視化"、2026-01-13）で、統計側にもArchive対応が追加された。Archive専用の`archiveLeafStatsStore`が導入され（`src/lib/stores/leaf-stats.svelte.ts`）、`src/lib/app-state.svelte.ts`（494-503行目付近）の`_totalLeafCount`/`_totalLeafChars`が切り替えを判定する。ただしこの判定は「現在アクティブなペイン」ではなく**左ペインのワールド・ビュー（`leftWorld`/`leftView`）に固定**されている（`leftWorld.value === 'archive' && leftView.value === 'home'`の時のみArchive側の統計を表示）。この値は`paneStateStore`経由で左右両方の`PaneView`（`StatsPanel`）へ共有されるため、右ペインの統計表示も実際には左ペインのワールドに追従する形になっている。これはADR-0002の左右対称原則（「コードに差があればバグ」）との整合性に疑問が残る実装詳細であり、別途調査の余地がある。

ただし「検索・統計はHomeのみ」という当初の決定そのものが撤回されたわけではない。Archiveが未ロードの間（ユーザーが一度もArchiveへ切り替えていない間）は検索・統計の対象外のままであり、「Archiveは実際に切り替えるまでPullしない」という本ADRの遅延ロードの前提は変わっていない。

## 追記（2026-07、#290）

上記の「左ペインのワールド・ビューに固定」されていた統計表示は、#290でペイン対応に修正された。`src/lib/stores/world-helpers.ts`に純粋関数`getLeafStatsForWorldView(world, view, homeStats, archiveStats)`を追加し、`PaneView.svelte`が自分自身の`paneWorld`/`currentView`（既存のペイン対応derived、`paneWorld`と同じ左右振り分けパターン）でこれを呼ぶように変更。`app-state.svelte.ts`側の左ペイン固定だった`_totalLeafCount`/`_totalLeafChars`とその公開経路（`paneStateStore`/`PaneState`型の該当フィールド）は不要になったため削除した。これによりADR-0002の左右対称原則との不整合は解消され、「別途調査の余地がある」という上記の留保は解消済み。
