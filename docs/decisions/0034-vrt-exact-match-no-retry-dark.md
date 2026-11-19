# 0034. VRT の判定を完全一致にし、リトライを外し、ダークも撮る(追認記録)

- 状態: 採用(ADR 0023 の差分の判定と projects を上書きし、対象 URL・ポート・clip / mask の逃がし・e2e の記述を訂正する)
- 日付: 2026-11-19
- 関連 PR: #162, #197, #202, #204(本 ADR はこれらの決定を後から記録する)
- 関連 ADR: [`0023`](0023-visual-regression-testing.md)(VRT の導入) / [`0027`](0027-content-neutral-vrt-baseline.md)(ベースラインの撮り方。0023 の `paths` と 2 ビルド差分を訂正済み) / edu-evidence ADR 0036(姉妹の同種の決定。このリポの実測を引いて後から採った)

## 背景

ADR 0023 は VRT を `maxDiffPixelRatio 0.01`・desktop / mobile の 2 projects で導入した。導入時の
`playwright.vrt.config.ts` は CI で `retries: 2` も持っていた(ADR の本文には無い)。

その後、判定・リトライ・projects は PR ごとに変わったが、どれも ADR を起こしていない。`CLAUDE.md` は
「ADR に載る設定値・対象 URL・ポートは導入時のもの」と注記するだけで、変えた理由は PR 本文と
`playwright.vrt.config.ts` のコメントにしか残っていない。本 ADR はそれを決定として記録する。

### 経緯

| PR | マージ(UTC) | 変更 | きっかけ・根拠 |
|---|---|---|---|
| #109 | 2026-06-25 | 導入。`maxDiffPixelRatio: 0.01`・CI で `retries: 2`・2 projects | ADR 0023 |
| #162 | 2026-08-09 | 比率を 0.001 に、`retries: 0` に | #160 で省庁バッジの色を変えたが VRT は検出しなかった。同一ビルド同士の撮り比べはノイズ 0 |
| #197 | 2026-08-27 | `threshold: 0` + `maxDiffPixels: 0`。比率は外す | 下の「比率をやめた理由」 |
| #202 | 2026-08-28 | ダークを足して desktop / mobile × ライト / ダークの 4 projects に | ダークは 1 枚も撮っていなかった |
| #204 | 2026-08-28 | (#202 のレビュー反映) | CI で 4 projects のノイズ 0 を実測。job は 3〜4 分から 5 分 58 秒に伸びた |

#162 は #160 を「文字が小さく比率 0.01 に届かなかった」と説明したが、#197 がこれを誤りとして訂正している
(次節)。

### 比率をやめた理由(#197)

取り逃がしは 2 系統あり、比率は片方しか塞がない。

- **長さ**: 許容量は総ピクセル数 × 比率なので、ページが長いほど甘い。比率 0.001 での許容は
  mobile `/search` 462px 〜 desktop `/laws` 7,063px で約 15 倍開いていた。#194 の `/scenes` は、
  差分 1,036px に対して許容 5,636px だったので通った
- **色差**: Playwright が pixelmatch に渡す `threshold`(既定 0.2)未満の色差は、差分として数えない。
  比率を 0 まで下げても色だけの変更は捕まらない。#160 を取り逃がした本当の理由はこちら

### ダークを撮る理由(#202)

ダークは `[data-theme="dark"]` で色トークンをまとめて差し替えるので、全ページの見た目が変わる。
それなのにピクセルの検査は一度も通っていなかった。コントラストは `e2e/a11y.spec.ts` が両テーマで
見ているが、レイアウトの崩れは見ない。ダーク専用のトークンを 1/255 だけ変えた変異で、4 projects では
8 件が赤になり、2 projects では 38 件すべてが緑だった。

## 検討した選択肢

1. **比率を下げ続ける**(#162 の形) — 却下。色差の系統が塞がらない
2. **`threshold: 0` にして比率を残す** — 却下。長さで許容が変わる系統が残る
3. **リトライを残す** — 却下。安定化ループでも収まらなかった間欠的な問題まで握り潰す
4. **ダークは a11y に任せる** — 却下。a11y はレイアウトを見ない
5. **`threshold: 0` + `maxDiffPixels: 0`、リトライ無し、4 projects** — 採用

## 決定

- 判定は `threshold: 0` と `maxDiffPixels: 0` にする。`maxDiffPixels` は未指定でも 0 になるが、明示する
  (型定義は既定値を約束していないので、`threshold` の既定 0.2 と同じ形で黙って緩むのを防ぐ)
- `maxDiffPixelRatio` は使わない
- リトライは入れない(`retries: 0`)
- desktop / mobile × ライト / ダークの 4 projects で撮る。ダークは `data-theme` を直接立てず、
  `colorScheme` のエミュレーションで与える(`Layout.astro` の起動スクリプトが `data-theme` を決める
  経路ごと撮るため)

値の正典は `playwright.vrt.config.ts`(撮影オプションは `vrt/targets.mjs`)で、
`scripts/__tests__/vrt-targets.test.mjs` が固定している。本 ADR には件数や対象 URL を写さない。

## 帰結

### 良い帰結

- 色だけの変更と、長いページでの小さな変更を検出できる
- ダークでしか出ない崩れを検出できる

### 反対意見とコスト

- **完全一致は、CI の描画の揺れで赤が常態化しうる。** 実測では揺れは出ていない。#197 で CI を 3 回まわして
  収束失敗 0、#202 の run で 4 projects の撮影も収束失敗 0。2026-08-28〜11-19 の VRT の run 120 本
  (success 106・failure 3・cancelled 11)でも、failure 3 本のログに収束失敗の文言は無い。揺れが出たら、
  判定を緩める前に撮影の安定化を疑う
- **`threshold: 0` はバイト一致ではない。** pixelmatch の `includeAA`(既定 false、Playwright は
  上書きしない)により、アンチエイリアスと判定された画素は数えない。エッジだけが変わる変更は通る
- **job が 5 分 58 秒に伸びた。** VRT は required check ではない(ADR 0023)ので、Dependabot の
  自動マージは VRT の結果を待たない。撮影を倍にしたぶん、結果がマージに間に合わない差が開いた
- **spec の書き方による上書きはガードの外にある。** `toHaveScreenshot` の第 2 引数や
  `page.emulateMedia` を spec に足すと、config を変えずに判定やテーマを変えられる。
  `vrt/pages.spec.ts` の冒頭に注意書きを置いている

### ADR 0023 の訂正

ADR は不変とする運用のため 0023 は書き換えず、本 ADR で訂正する(ゲートの `paths` 列挙と 2 ビルド差分は
ADR 0027 で訂正済み)。

| 箇所 | 訂正 |
|---|---|
| 設定「2 projects、`maxDiffPixelRatio 0.01`」 | 本 ADR で `threshold: 0` + `maxDiffPixels: 0`、4 projects |
| スペック「代表 1 ページ(計 18)」「`/search` は無いため対象外」 | `/search` は #125、`/404` は #144 で加え、`/changelog` は #159 で外した(PR ごとに 1 件増えるので内容の追加だけで毎回赤になる)。個別ガイドは #303 で 12 本目を加えた。代表 URL の列挙は #199 で `vrt/pages.spec.ts` から `vrt/targets.mjs` に移り、そこが正典 |
| トレードオフ「テンプレートを追加したら `vrt/pages.spec.ts` に代表 URL を 1 行追記する」 | 追記先は `vrt/targets.mjs` |
| 「ポートは 4173 を新規割当」と、その理由「別リポ・別 CI ジョブで動くため衝突しない」 | 理由が誤っていた。4173 は edu-evidence の Playwright と同じポートで、ローカルでは `reuseExistingServer` により一方が他方のサーバーにつながりうる。#149 で 4175 に変えた |
| トレードオフ「CI で揺れが残る場合は該当ページを viewport clip / mask にフォールバックする」 | #200 で `fullPage: true` を `vrt/targets.mjs` の `shotOptions` に置き、ガードで固定した。clip / mask に替えると required check の「Build site」が赤になる。取るなら同ファイルと `scripts/__tests__/vrt-targets.test.mjs` を同時に変える |
| 背景・「edu-law 固有の差分」・「なぜこの判断にしたか」の「e2e が存在しない / 無い」 | #160(2026-08-09)で `e2e/a11y.spec.ts` が入り、その後に機能テストも加わった。ピクセルの一致は VRT、コントラストは a11y が見る |

## 撤回 / 再検討の条件

- CI で収束失敗が出るようになり、撮影の安定化で収まらない場合は、判定の緩め方(ページ単位の mask 等)を
  別 ADR で決める
- テーマの切り替え方(`colorScheme` から `data-theme` を決める経路)を変える場合は、ダークの撮り方を見直す
