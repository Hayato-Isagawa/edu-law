# 0023. ビジュアルリグレッションテスト(VRT)を視覚変更 PR に限定して導入する(edu-evidence ADR 0024 ミラー)

- 状態: 採用
- 日付: 2026-06-26
- 関連 PR: test/visual-regression-testing
- 関連 ADR: edu-evidence 0024(原本・本 ADR のミラー元) / 0008(レイアウト骨格) / 0014(カード角丸)

## 背景

EduLaw JP は共有レイアウト(`src/layouts/`)・共有コンポーネント(`src/components/`)・単一のグローバル CSS(`src/styles/global.css`、Tailwind v4)で全ページの見た目を統一している。これらのデザイントークン・BRAND は edu-evidence からミラーしたものであり(`docs/BRAND.md` は姉妹サイト共通)、手を入れると法令一覧・法令詳細・場面ハブ・ガイド各ページへ視覚的影響が波及する。現状その回帰は手動の目視でしか検出できていない。

edu-law には機能テスト(e2e)が存在しないため、レイアウト崩れ・余白・配色といったピクセルレベルの回帰を検出する自動化はこれまで何もなかった。一方で法令データ(`src/content/laws/*.md`)・changelog の更新はテキスト差分を生むため、全 PR に VRT をかけると差分がノイズだらけになる。

edu-evidence は ADR 0024 で、視覚面に触れる PR だけに走るゲート付き VRT を案 A(CI 内で main と PR を両方ビルドし同一 Linux 環境で撮影・比較)で導入済みである。ファミリー横展開方針(ADR 0024 末尾)に従い、UI 一致度が最も高い edu-watch を先に移植し(edu-watch ADR 0060)、本リポ(根)を後続として同方式でミラーする。

## 決定

edu-evidence ADR 0024 の構成を **機械的にミラー** して導入する。

- スペック: `vrt/`(別ディレクトリ)。テンプレートごとに代表 1 ページ(計 18): トップ / about / changelog / 場面ハブ(`/scenes`)/ 法令一覧・詳細 / ガイド一覧 + 個別ガイド 11 本。個別ガイドは共通テンプレートではなく 1 ページずつ独立した `.astro` で著述しているため、各 1 枚を代表とする。`/search` は無いため対象外。
- 設定: `playwright.vrt.config.ts`(`testDir: ./vrt`、desktop 1280 / mobile 390 の 2 projects、`maxDiffPixelRatio 0.01`、アニメーション無効化、`expect.timeout 30000`)。
- ベースラインはコミットしない。`vrt/__screenshots__/` は `.gitignore` で除外する。
- ゲート: `.github/workflows/vrt.yml` を `pull_request` の `paths` フィルタで `src/layouts/**`・`src/components/**`・`src/styles/**`・`astro.config.*`・`vrt/**`・`playwright.vrt.config.ts`・`.github/workflows/vrt.yml` に限定する。`src/content/**` だけの PR では起動しない。`workflow_dispatch` で手動実行も可能。
- 2 ビルド差分(案 A): CI ジョブ内で PR ブランチをビルド(`dist-pr`)、`git worktree` で main をビルド(`dist-main`)し、main を `--update-snapshots` で撮影してベースライン化、続けて PR を同一環境で撮影・比較する。
- required check には含めない。VRT は視覚変更 PR でしか起動せず、結果は情報提供でマージ可否は編集者が判断する(rule 13)。

### edu-law 固有の差分

- **Playwright 未導入のため `@playwright/test ^1.61.0` を devDep に新規追加する。** バージョンはファミリー(edu-evidence・edu-watch)と統一する。これに伴い `package-lock.json` も更新する。
- **ポートは 4173 を新規割当。** edu-law には e2e が無く既存の Playwright ポートを持たないため、原本(edu-evidence)と同じ 4173 を割り当てる。両者は別リポ・別 CI ジョブで動くため衝突しない。
- **worktree パスは `/tmp/edu-law-main`**(原本は `/tmp/evi-main`)。
- **`.gitignore` に `test-results`・`playwright-report` も新規追加する。** edu-evidence・edu-watch は e2e 由来で既に登録済みだったが、edu-law は e2e が無いため未登録であり、`vrt/__screenshots__/`・`dist-pr`・`dist-main` と併せて追加する。

## なぜこの判断にしたか

- edu-law も Layout・`global.css`・BRAND を edu-evidence からミラーしており、共有意匠を改修したときの視覚回帰検出の恩恵がある。e2e が無く目視以外の自動検出手段が皆無だったため、導入の価値はむしろ高い。
- 案 A はベースライン PNG をコミットしないため、リポジトリが肥大化せず、ローカル(macOS)と CI(Linux)でのフォント描画差も同一 Linux ジョブ内の 2 ビルド比較でキャンセルされ、検出される差分は実変更のみとなる。
- 原本(ADR 0024)と同一構成にすることで、ファミリー横断のメンテナンスコストを最小化できる(aria/data 属性・アクセントバー・changelog 文体を 3 リポで揃えてきた方針と一貫)。

## 帰結

- 共有レイアウト・コンポーネント・`global.css` 改修時の視覚回帰を、目視に頼らず差分画像で確認できる。
- 法令・changelog のデータ更新 PR は `paths` ゲート対象外のため、日常の更新を妨げない。
- ローカルでは `npm run vrt`(現在の `dist` に対する撮影・比較)で確認できる。権威ある 2 ビルド差分は CI で行う。
- これでファミリー 3 サイト(葉・双葉・根)すべてに VRT が揃う。portfolio は UI 構成が異なるため対象外のまま据え置く。

## トレードオフ / 既知のリスク

- 視覚変更 PR では main と PR を 2 回ビルドするため、1 回の VRT 実行に追加のビルド時間がかかる。
- 対象 URL・差分閾値は手動メンテナンスが必要。テンプレートを追加したら `vrt/pages.spec.ts` に代表 URL を 1 行追記する。
- `fullPage` 撮影は最長ページで 1px 単位の揺れが出ることがある。撮影前に末尾→先頭へスクロールして遅延読み込みを settle させる安定化を原本から継承済みだが、CI で揺れが残る場合は該当ページを viewport clip / mask にフォールバックする。

## 撤回 / 再検討の条件

- フォント描画が環境非依存になる方針(Web フォントの自前ホスト等)へ変える場合は、ベースラインの持ち方(案 A / 案 B)を再検討する。
- 共通レイアウトを npm package 化してファミリーで共有する場合は、VRT の置き場所(各リポか共通パッケージか)を再定義する。
