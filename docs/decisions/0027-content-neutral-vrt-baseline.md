# 0027. VRT のベースラインを「main のコード × PR のコンテンツ」で撮る(edu-evidence ADR 0034 ミラー)

- 状態: 採用
- 日付: 2026-09-11
- 関連 PR: ci/vrt-content-neutral-baseline
- 関連 ADR: [`0023`](0023-visual-regression-testing.md)(VRT の導入) / edu-evidence ADR 0034(原本) / edu-evidence ADR 0035(依存 bump で VRT を起動。このリポは `package-lock.json` を先に載せていた)

## 背景

ADR 0023 は法令本文・ガイド(`src/content/`)の編集が毎回テキスト差分を生むため、VRT を `paths` で限定起動する
設計にした。しかし `src/pages` や `src/data` を触る PR が main との間にコンテンツ修正を挟むと、その修正が
`getCollection` や `src/data` 経由でページの描画に波及し、視覚回帰ではない赤が出る。`paths` では止められない。

edu-evidence は同じ問題を ADR 0034 で「ベースラインを main のコード × PR のコンテンツで撮る」形に変え、
過去 PR の再現で 5 赤 → 1 赤(残った 1 赤はテンプレートを触った本物)を実測している。edu-watch も同じ形に
揃えた(edu-watch ADR 0068)。

## 決定

**ベースラインを「main のコード × PR のコンテンツ」で撮る。** `Build baseline (main code x PR content)`
ステップが main の worktree に PR の `src/content/` と `src/data/` を `rsync -a --delete` で、
`src/content.config.ts` を `cp` で運んでからビルドする。main のコードで PR のコンテンツをビルドできなければ、
main 自身のコンテンツで撮り直す(degraded。summary と artifact 名 `vrt-report-<mode>` に出す)。
`workflow_dispatch` の `neutral: false` で素の main と撮り比べる逃がしも持つ。

### `src/data/**` を `paths` から外す

運ぶ以上、`paths` に残すと「起動はするが構造上ぜったいに差分が出ない」トリガになる。以前は `src/data/**` を
載せて `!src/data/changelog.ts` だけ打ち消していたが、運ぶ側に移したので打ち消しも要らなくなった。

`changelog.ts` を運んでもトップの描画は変わらない — 「最近の更新」のリストは `vrt/targets.mjs` の `hide` で
撮影前に隠している。

### ガード

運ぶ素材の allowlist は手書きなので、`scripts/__tests__/vrt-baseline.test.mjs` が `src/` の実ディレクトリを
走査し、「運ぶ・`paths` で監視する・描画に入らないと明言する」の三択を強制する。運ぶディレクトリが `paths` に
残っていれば赤。位置(運ぶのがビルドより前)・`--delete`・`id: baseline`・degraded の失敗許容がビルド 1 つに
閉じていること・artifact 名も固定している。既存の `vrt-targets.test.mjs`(撮影対象・撮影設定・`VRT_DIST` の
2 ステップ)とは検査対象が重ならない。

`test:workflows` の口に 3 本目のファイルが増えたので、`package.json` の下限と
`scripts/__tests__/content/check-source-titles.test.mjs` の `WORKFLOW_TESTS` / ファイル一覧を同時に直した
(この相互固定は `CLAUDE.md`「配線の検査は、守る対象と違う口に置く」)。

## 帰結

### 利点

- 他ファイルの法令・ガイド修正が波及しただけの赤が構造的に消える
- テンプレート・共有コンポーネント・`global.css` の回帰は残る(edu-evidence の実測では同一集合)

### コスト・受け入れた死角

- degraded ではベースラインを 2 回ビルドする(4 projects 76 件の撮影は変わらない)
- **`scenes.ts` / `publishers.ts` の中のロジックの変更が VRT から見えなくなる。** 純データではないが、
  `src/data` ごと運ぶ。データとロジックを別ファイルに割ればロジック側を `paths` に戻せる
- `.astro` に直接書かれた散文は中立化されない
- コンテンツ起因のレイアウト崩れ(長い見出しの折り返し等)は両側に同じ文字列が入るので見えない。
  `neutral: false` の手動実行が逃がし

### ADR 0023 の訂正

ADR は不変とする運用のため 0023 は書き換えず、本 ADR で訂正する(設定値・対象 URL・ポートが導入時のもので
あることは `CLAUDE.md` が既に注記している)。

| 箇所 | 訂正 |
|---|---|
| ゲートの `paths` 列挙 | その後 `src/pages/**`・`src/data/**`・`package-lock.json` が追加され、本 ADR で `src/data/**` が削除された |
| 2 ビルド差分(案 A)「`git worktree` で main をビルド」 | main のコードに PR の `src/content` / `src/data` / `src/content.config.ts` を運んでからビルドする |

## 撤回 / 再検討の条件

- degraded が常態化するなら、運ぶ素材の形(`src/data` の中のロジック)を見直す
- コンテンツ起因の崩れを取り逃がした実例が出たら、`neutral: false` を既定に戻すか、崩れの型ごとに
  撮り方を足す
