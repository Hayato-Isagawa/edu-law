# EduLaw JP

日本の小学校教員向けに、教育関連法と公式解説(文科省・文化庁・厚労省・e-Gov)を法令別に整理する静的ポータル。Astro 7 + React 19 + Tailwind 4 + TypeScript。

## 設計の核

- **自前の法解釈はしない。** サイトが提供するのは「法令本文への e-Gov リンク + 公式解説の見出し整理 + 公式 URL への誘導」のみ
- 法解釈・現場助言は弁護士・行政書士の領域。本サイトはそれらへの**入口**を整理することに徹する
- 引用は **公共データ利用規約 第 1.0 版** の範囲内に限り、出典・URL・取得日を必ず明記する(具体的な引用ルール ADR は別途起票)

## ブランド

- **モチーフ**: 根(root)。EduEvidence JP(葉)・EduWatch JP(双葉)と対になり、「足元から支える基盤」を象徴する
- **アクセント色**: 茶 `#6b4423`(`--color-accent`)
- **ロゴ**: `src/components/Logo.astro` に根モチーフの inline SVG(`currentColor` 継承)を実装済み。`SiteHeader` / `SiteFooter` で使用する。`public/favicon.svg` は最小ブランドマーク
- 詳細は [`docs/BRAND.md`](docs/BRAND.md)(姉妹サイト共通、edu-evidence からミラー)

## 環境

Node.js 24 系を `.tool-versions` で固定。[mise](https://mise.jdx.dev/) を推奨。

```bash
mise install
npm ci
```

`package.json` の `engines.node` は `>=24.0.0`。

## ビルド・テスト

```bash
npm run dev      # 開発サーバー(localhost:4324。ファミリー各リポで固定・4321 は未設定プロジェクト用に空けている)
npm run build    # 本番ビルド
npm run preview  # ビルド結果のプレビュー
npm run check    # Astro 型チェック(CI の required check「Build site」に含まれる)
npm run check:sources # 公式解説の書名が正本と 4 つの写し先で一致しているか(同上)
npm run test:hooks # .claude/hooks/ の回帰テスト(同上・下限つき)
npm run test:content # check:sources の回帰テスト(同上・下限つき)
npm run test:workflows # link-check.yml の通知分岐の回帰テスト(同上・下限つき)
npm run test:e2e # Playwright(a11y + 機能テスト。要: 先に npm run build)
npm run vrt      # ビジュアルリグレッションテスト(現 dist を撮影・比較。権威ある比較は CI、後述)
```

### `test:workflows` — link-check の通知分岐

`link-check.yml` に埋め込まれた「検出をどう届けるか」の判定を固定する。**壊れても静かに壊れる** —
lychee は走り、レポートもアーティファクトに残り、job も緑のまま**通知だけ**が消える。姉妹リポ
okinawa-in-data では open な link-check Issue があると後続の検出を捨てており、2026-08-17 に
見つかった 404 が 2 日間どこにも出なかった(okinawa-in-data#107 / #110。このリポも同じコードを
共有していた)。

テストはワークフローから `run:` ブロックを取り出して bash で走らせ、`gh` をスタブして渡された
引数を全部記録する。**写しを置かないので、ワークフロー側を変えるとテスト対象も変わる** —
数値や条件をテストに書き写さないこと(上限バイト数とレポートのファイル名はワークフローから
読み取っている)。シェルからは見えない YAML の配線も併せて固定している:

- 通知ステップに `continue-on-error` が**無い**こと(付くと `gh` の失敗が job に伝わらない)
- `Run lychee` に `id: lychee` が**ある**こと(消えると `exit_code` が空文字になり毎週 Issue が立つ)
- `Upload report` が job を落とさないこと(落ちると通知ステップの暗黙の `success()` が偽になる)
- `output:` とシェルが読むファイル名が一致していること

通知は 3 分岐。タイトルが実態と食い違わないようにしてある:

| 状況 | タイトル |
| --- | --- |
| 検出あり | `Link check found problems` |
| レポートを出せず終了 | `Link check could not produce a report` |
| 1 本も見なかった | `Link check found no links to check` |

3 つ目は `lychee-action` の `failIfEmpty`(既定 true)の経路。**lychee の終了コードを 0 のまま残して
action だけが exit 1 する**ので、`exit_code` だけを見ていると通知が skip され、`continue-on-error`
で job も緑になる＝週次チェックが恒久的に no-op になる。`steps.lychee.outcome` は
`continue-on-error` 適用**前**の結果なので、そこで拾っている。

`test:workflows` / `test:hooks` / `test:content` は `assert-test-files.mjs` /
`assert-test-results.mjs` を通している。`node --test` は「glob が 0 件」「中身が空」「全件 skip」の
どれでも exit 0 で終わるので、守っているつもりのガードが no-op に落ちても気づけないため。

**下限の決め方は口ごとに違う。** `test:workflows` と `test:content` は実測ちょうど(余裕ゼロ)に
してある。余裕を取らないのは、離した分だけ静かに減らせるため — **テストを足したら下限も上げること**。
`test:hooks` だけは 50 のままで実測(74)と離れている。ファイルが 1 本なので「全部消える」は下限 1 でも
捕まるが、24 本までは静かに減らせる状態でもある。揃えるなら実測ちょうどへ上げる。

**口は glob で分けている。** `scripts/__tests__/*.test.mjs` の `*` は `/` を跨がないので、
`scripts/__tests__/content/` は `test:workflows` に拾われない。混ぜると 1 つの下限が両者の合計と
比べられ、片方が減っても他方が増えていれば割らない(glob を `**` に広げて下限を 51 に据え置くと、
link-check の 51 本のうち 39 本を消しても 12 + 90 = 102 で緑)。

**配線の検査は、守る対象と違う口に置く。** ステップを丸ごと消されると、その口で走る検査は
実行されないので赤にならない。`test:workflows` と `test:content` は互いのステップを見ており、
`check:sources` のステップは `test:content` 側から見ている。**`test:hooks` / `check:tokens` /
`Type check` / `Build` のステップは、まだどの口からも見ていない。**

## アクセシビリティ検査(a11y)

`e2e/a11y.spec.ts` が **dist の全ページ**を axe にかける(`.github/workflows/e2e.yml` が PR ごとに実行)。

- **ページ一覧は dist から動的に列挙する**。姉妹リポ(evi / watch)は代表 8 / 5 ページのハードコードだが、
  このリポは法令とガイドが増えていく前提なので、追加したページが黙って対象から漏れる方式は採らない
- **ライト / ダークの双方を検査する**。ダーク側だけで落ちる配色(dark 変種の付け忘れ)を取り逃がさないため。
  導入時に実際、トップの CTA ボタン(白文字 on アクセント = 2.51:1)と更新履歴ラベル(-700 系 = 2.94〜3.53:1)が
  ダーク側だけで落ちた
- **既知違反の allowlist は置いていない**。姉妹 2 リポは持っているが中身は空で、実際に許容しているものが無い。
  空の allowlist は「後で足せる穴」でしかないので、許容が必要になった時点で理由とともに作る
- 判定は critical / serious のみ。moderate 以下は落とさない

## 機能テスト(E2E)

`e2e/` の残り 3 本。a11y と同じワークフローで走る。

- **`search.spec.ts`** — pagefind が「置いてある」ではなく「引ける」ことを見る。
  検索は `npm run build` 後段の `npx pagefind --site dist` が dist/pagefind/ を作り、
  ページ側の script がそれを読む。**索引の生成が飛んでも UI は入力欄を描いたまま
  0 件を返すだけ**なので、ページの表示だけを見るテストでは壊れていることに気づけない
  (姉妹リポ edu-evidence の検索テストは実際そこまでしか見ていない)
- **`navigation.spec.ts`** — 主要導線と、**件数表示が実態と一致すること**。
  「対象の N 法令」は約束そのものなので、宣言と実際の法令数がずれたら記載の誤りになる。
  404 は 2026-08-05 に直した不具合(存在しない URL でトップがそのまま出ていた)の再発防止
- **`official-links.spec.ts`** — 12 法令すべてに e-Gov へのリンクがあること、
  別タブで開く外部リンクが `rel="noopener"` を持つこと。
  **このサイトの機能要件は外部リンクが正しいことそのもの**なので、付随的な品質ではない。
  リンク先の生死は週次の link-check(lychee)が見る

### 検索テストを書くときの注意

pagefind は**日本語を分割して部分一致させる**ので、和文の造語では 0 件にならない。
「ぬりかべこんにゃくざむらい」で 11 件返る(実測)。0 件を確かめたいときは索引に無いことが
確実な ASCII 列(`zzqqxwv`)を使う。また 1 ページにつき本文と見出しアンカーで複数の結果が
出るため、件数を固定値で書かない。

## frontmatter 不変性ガード

`.claude/hooks/pre-edit-frontmatter-immutable.cjs` が Edit / Write / MultiEdit を検査し、
読者に見せる事実が変わるときだけ確認を挟む(`permissionDecision: "ask"`。ブロックではない)。

| 対象 | 見るもの |
| --- | --- |
| `src/content/laws/*.md` | 保護フィールド(`title` / `order` / `eGovUrl` / `officialExplanations[].url` / `lastVerified` / `publishedAt` / `retrievedAt`)+ URL 集合 + e-Gov 法令 ID |
| `src/pages/**/*.astro` | URL 集合 + e-Gov 法令 ID(ガイドに ID が 18 箇所直書きされているため) |

`.astro` は `---` の中身が JS で `title:` がデータとして頻出するので、保護フィールドは
法令エントリにだけ当てる。自サイト URL と `schema.org` は除外する。
**e-Gov の法令 ID は URL とは別に単独でも追跡する** — `418AC0000000120` の末尾 1 桁だけを
書き換える Edit は断片に `https://` を含まず、URL 集合にも `eGovUrl:` の行にも現れないため。
Write は差分を持たないのでディスク上の現物と突き合わせ、**読めない場合は素通りさせず確認を出す**
(新規作成 = ENOENT だけ通す)。

**このサイトでは URL と識別子そのものが商品**なのに、既存の検査系はどれも誤りを構造的に検出できない:
e-Gov の法令 ID は不透明(`418AC0000000120` = 教育基本法)で、1 文字違えば別の実在法令を指し、
週次 link-check(lychee)は 200 を返す。`astro check` は型が正しく、e2e / vrt は正常に描画される。
`lastVerified` が黙って進めば stale-check は「未確認を確認済み」と報告する。

回帰テストは `.claude/hooks/__tests__/` に置き、`npm run test:hooks` で走る。
`node --test` は **0 件マッチ・中身が空・全件 skip のいずれでも exit 0** で終わるので、
前段に `scripts/assert-test-files.mjs`(ファイルの存在)、後段に
`scripts/assert-test-results.mjs`(pass の下限と skip / todo 0)を噛ませてある。
テストを増やしたときに下限を上げる必要はないが、まとめて消したときは落ちる。

## 書名一致ガード(`check:sources`)

公式解説の書名は、正本のほかに**独立して 4 箇所へ写されている**。

| 場所 | 形 | 検査 |
| --- | --- | --- |
| frontmatter `officialExplanations[].title` | `[slug].astro` が `発行元『title』` で描画する | **正本** |
| 本文末尾の `## 出典` 節 | md に `発行元『書名』(取得日: …)` と直接書いてある | 全引用 |
| frontmatter `summary` | サイト自身の散文の中に `発行元「書名」` | 発行元名付き |
| `src/pages/index.astro` の Highlights | 構造(`title` + `href`) | `[0]` と完全一致 |
| `src/data/*.ts` ほか `src/` 全体 | 散文の中に `発行元『書名』` | 発行元名付き |

**片方だけ直すと静かにずれる。** 2026-08-25 に実際に出た: #190 が frontmatter の 13 件を
発行元の表記に揃えたが、出典節が同じ書名を独立に持っていることを見落とし、出典節 7 件 +
本文リンク 1 件が旧表記のまま本番へ出た。#191 で追随し、#194 でさらに法令 md の外に残っていた
**11 件**(Highlights 5 / `scenes.ts` 1 / `changelog.ts` 3 / `summary` 2)を直した。
**`astro check` も e2e 90 件も週次 link-check も通り、表示も正常**なので、マージ後に公開 URL を
人手で 2 値判定するまで誰も気づけなかった。

`scripts/check-source-titles.mjs` が全箇所を frontmatter の `title` と突き合わせる。

- **『』だけでなく「」も見る。** 児童虐待防止法は関係省庁連名通知の名前を「」で引用しており、
  それは `officialExplanations` にも載っている。入れ子は両向きに実在する
  (`『「子ども虐待…」の一部改正』` と `「保護者…へ 『児童虐待の根絶に向けて』」`)ので、
  深さを数えていちばん外側だけを取る
- **出典節の外では「発行元名プレフィックス」で書名を同定する。** `発行元『書名』` /
  `発行元「書名」` の形(直前が `src/data/publishers.ts` の `PUBLISHER_LABELS` の値)だけを見る。
  括弧引用を全部拾うと UI ラベル・ページ名・法令名まで対象になって例外が 40 件超必要になり、
  しかも `法令`(児童福祉法の公式解説)や `学校安全` のように**普通名詞と同じ書名**が散文で
  直せない赤になる。逆に括弧を無視した全文走査は、同じ短い書名のせいで偶然一致が 160 件出る
- **例外は同じファイルの中でマークする。** 語は `body-only:` の 1 つで、構文だけ言語に合わせる —
  md 本文 `<!-- body-only: 書名 -->` / YAML 行末 `# body-only: 書名` / JS・TS・`.astro` の
  frontmatter `// body-only: 書名`。現在 15 件(出典節 3 / `summary` 2 / `src` 側 10)で、
  実データの一覧は `check-source-titles.test.mjs` の `EXPECTED_MARKS` が固定している
- **allowlist を別ファイルに置かない。** 書名を消したときにマークだけが残る経路を作らないため。
  「frontmatter に在る書名を指すマーク(昇格後の消し忘れ)」と「どの引用とも一致しないマーク
  (消し忘れの残骸)」をどちらも赤にする
- **公開 HTML に残るのは md 出典節のマークだけ**(不可視・pagefind の索引にも入らない)。
  取り除くには rehype プラグインが要るので、残す方を採っている。YAML と JS のコメントは
  ビルドで消える(`summary` の描画に混ざらないことは dist で実測済み)
- **Highlights は `officialExplanations[0]` と完全一致で縛る。** ADR 0009 第三基準と ADR 0026
  そのもの。**この検査が赤くなったとき、代表解説を変えたいなら `officialExplanations` の
  並び順を先に変える**(トップの配列を直接書き換えない)。slug の重複なし・全法令の被覆・
  実在する法令であることも見るので、7 件のまま黙って縮む経路も塞がっている
- **照合先の範囲は場所で違う。** 法令 md(出典節・`summary`・本文)はその法令自身の
  `officialExplanations` と、`src/` 側は全法令の正本と照らす
- **素通りに落ちる主要な経路を塞いである。** 対象ファイル 0 件・法令 md 0 件・走査ファイル 0 件・
  `publishers.ts` や `index.astro` の欠落・出典節が無い / 2 つある・出典節に引用が 1 件も無い・
  閉じていない括弧・frontmatter や `officialExplanations` / `summary` の欠落・エントリ 0 件・
  エントリ数と `title` 数の不一致・ブロックスカラー・Highlights が読めない 6 形は、すべて赤にする
- **走査しない拡張子だけを列挙している**(現在 `.css` のみ)。知らない拡張子は既定で走査に入るので、
  `.tsx` を新設して書名を置いても検査から漏れない
- **残る盲点**: 発行元名を伴わない書名引用は、出典節の外では見ない。括弧そのものを外す編集も
  見ない。実測では正本 30 件のうち **25 件は改名すればどこかが赤になり、5 件は無反応**
  (著作権法 4 / 児童虐待防止法 1 — いずれもどの写しにも現れない)
- 回帰テストは `scripts/__tests__/content/` に置き、`npm run test:content` で走る。
  検査の各経路と、**プロセスの exit code**(CI が読むのはここだけ)、npm script と
  `build.yml` への配線を固定している

## 対象法令 — 12 法令

現場照会頻度順に以下を対象とする:

1. 学校教育法
2. 教育職員免許法
3. いじめ防止対策推進法
4. 児童虐待防止法
5. 著作権法 35 条
6. 個人情報保護法(学校現場関連)
7. 児童福祉法
8. 教育公務員特例法
9. 地方公務員法
10. 学校保健安全法
11. 教育基本法
12. 教育機会確保法

今後の追加候補: 子どもの権利条約、判例。

## ビジュアルリグレッションテスト(VRT)

共有レイアウト(`src/layouts/`)・コンポーネント(`src/components/`)・`global.css` の改修による視覚回帰を、目視に頼らず差分画像で検出する仕組み(ADR 0023、edu-evidence ADR 0024 のミラー)。edu-law には e2e が無く、これが唯一の自動視覚検出系統となる:

- **設定**: `playwright.vrt.config.ts`(`testDir: vrt/`、desktop 1280 / mobile 390 の 2 projects、`maxDiffPixelRatio: 0.001`、`retries: 0`、アニメーション無効)
- **閾値は実測で決めている**。同一ビルド同士の撮り比べは差分 0(閾値 0 で 38 件全通過 × 2 回)。
  一方 `h2` の `letter-spacing` を 0.06em 変える実験では、旧閾値 0.01 だと 38 件中 4 件しか
  落ちなかった(0.001 では 29 件)。**全画面撮影に対して 1% は緩すぎる**。
  実際 #160 で省庁ラベルの色を変えたときも、11px の文字 4 個だったので旧閾値では検出されなかった
- **リトライは入れない**。差分が実測 0 なら、リトライは間欠的な問題を握り潰すだけになる
- **対象**: `vrt/pages.spec.ts` がテンプレート代表 18 URL(トップ / about / changelog / 場面ハブ / 法令一覧・詳細 / ガイド一覧 + 個別ガイド 11 本)をフルページ撮影。テンプレートを追加したら代表 URL を 1 行追記する
- **ゲート**: `.github/workflows/vrt.yml` が `pull_request` の `paths` で `src/layouts/**`・`src/components/**`・`src/styles/**`・`astro.config.*`・`vrt/**`・`playwright.vrt.config.ts` に限定起動。`src/content/**` だけの PR では走らない(`workflow_dispatch` で手動実行可)
- **比較方式(案A)**: CI 内で main と PR を両方ビルドし、同一 Linux 環境で撮影・比較する。ベースライン PNG はコミットしない(`vrt/__screenshots__/` は gitignore)。システムフォント描画の macOS↔Linux 差を回避するため
- **ローカル**: `npm run vrt` で現在の `dist` を撮影・比較できる。権威ある 2 ビルド差分は CI 側
- **required check 非対象**: 視覚変更 PR でしか起動しないため required には含めない。マージ可否は編集者判断(rule 13)

## ホスティング

Cloudflare Workers の静的アセット配信(Workers Builds が GitHub `main` を監視して自動デプロイ)。
設定は `wrangler.jsonc`。2026-08-05 に Cloudflare Pages から移行した。
ドメイン: `law.edu-evidence.org`(`edu-evidence.org` サブドメイン)
セキュリティヘッダー: `public/_headers`(Workers でもそのまま解釈される)
リダイレクト: `public/_redirects`(同上)
ボット設定: `public/robots.txt`

**Cloudflare のメールアドレス難読化は Workers では効かない**。Pages 配信時は `mailto:`
が `/cdn-cgi/l/email-protection#…` に置換されていたが、Workers では生のアドレスが出る。
不具合ではなく Scrape Shield の仕様で、受容すると決めている(edu-evidence ADR 0032)。

## 連絡先

`law@edu-evidence.org`(個人 Gmail に転送)。具体的な転送先アドレスは Cloudflare Email Routing 管理画面に保持し、リポジトリ・README・docs に記載しない(spam リスク回避)。

## コンテキスト管理

主要な決定と進行状態は会話ではなくファイルに残す:

- **主要な意思決定** → [`docs/decisions/`](docs/decisions/)(ADR、不変)
- **現在のセッションの作業状態** → `.claude/state/active.md`(生きたチェックポイント、git 追跡外)
- **運用方針の全体** → [`docs/context-management.md`](docs/context-management.md)

`.claude/hooks/pre-compact.sh` と `post-compact.sh` が圧縮時に active.md を dump / 再読込リマインダーを出すよう登録されている(`.claude/settings.json`)。
