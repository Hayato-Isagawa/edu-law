# 0028. lint と整形に oxlint / oxfmt を採用する(edu-evidence ADR 0037 ミラー)

- 状態: 採用
- 日付: 2026-09-12
- 関連 PR: #(本 ADR と同一 PR で確定)
- 関連 ADR: edu-evidence ADR 0037(原本)

## 背景

このリポには linter も formatter も無かった。検査は法令・ガイドの書名一致とトークン規約に寄っていて、
`scripts/` `.claude/hooks/` `e2e/` の JS / TS と `.astro` の frontmatter は型検査（`astro check`）以外に見るものが
無い。ファミリーで開発ツールを VoidZero（Vite / Rolldown / Oxc）に揃える方針に沿い、Oxc の oxlint と oxfmt を入れる。
バンドラは Astro 7 経由で Vite 8（内部は Rolldown）を既に使っている。

一次資料（oxc.rs のドキュメント）と実機（oxlint 1.82.0 / oxfmt 0.67.0）で確かめた前提:

- oxlint は `.astro` の frontmatter と `<script>` を lint する（`debugger` を両方で検出）。既定は `correctness`
  カテゴリで、warning でも exit 0
- **oxfmt は `.astro` を扱えない**（対応言語表に無く、Prettier プラグインは Not supported。実機でも対象外）
- 両方とも postinstall を持たず、プラットフォーム別バイナリは optionalDependencies で入る

## 検討した選択肢

1. **oxlint + oxfmt**（採用）。`.astro` の整形は諦める
2. eslint + prettier + prettier-plugin-astro。`.astro` も整形できるが、ファミリーの方針と逆で、速度も劣る
3. lint だけ入れて formatter は入れない。整形の揺れが残る

## 決定

### oxlint

- `.oxlintrc.json`: 既定カテゴリ（correctness）。`no-irregular-whitespace` は `skipComments: true`（コメント内の
  全角空白は日本語の例示で、`.claude/hooks/pre-edit-frontmatter-immutable.cjs` に実在する）。`ignorePatterns` は
  空（`.md` / `.yml` / `.css` は oxlint の対象外なので、oxfmt 側の除外は要らない）
- 導入時の warning は 4 件。`[...new Set(x)].length` → `Set#size`、`/^summary:/.test` → `startsWith` は挙動を変えずに直した。
  `check-source-titles.mjs` の `matchAll(new RegExp(MARK_SYNTAX[syntax]))` は `oxc/bad-match-all-arg` の偽陽性
  （元の正規表現が `g` 付きで、`new RegExp(regex)` はフラグを引き継ぐ）なので理由つきの inline ignore。残る 1 件は
  `skipComments` で消えた
- `npm run lint` = `oxlint --deny-warnings`。warning で止めないと CI で意味を持たない

### oxfmt

- `.oxfmtrc.json`: `printWidth 80` / `semi` / ダブルクォート / `tabWidth 2` / `trailingComma es5`（姉妹サイトの
  prettier 設定と同じ値）。`sortPackageJson: false`（既定 true は `package.json` のキー順を
  並べ替える。prettier に無い挙動で、`overrides` の並びが動く）
- **対象は oxfmt が検出する言語のうち、次を除いたもの**（`ignorePatterns`）:
  - `**/*.md` — 本文と docs。frontmatter を守る hook があり、CJK の表パディングは見た目が揃わない
  - `**/*.yml` `**/*.yaml` — workflow のガードテスト（`vrt-baseline.test.mjs` 等）が字面で検査している
  - `**/*.css` `**/*.scss` — **整形が本番 CSS を変える。** edu-evidence で `global.css` の `color-mix(...)` を
    複数行に折ると Lightning CSS の出力が `#0059861a` から `oklab(…/.1)` に変わった（同じ色の別表記だが byte 同一
    ではない）。Tailwind の `@theme` CSS は整形の対象にしない
  - `**/*.html` — 生成物
  - `wrangler.jsonc` — 配信設定を 1 バイトも触らない
- `npm run format` = `oxfmt`、`npm run format:check` = `oxfmt --check`（CI）
- 初回整形は同じ PR の別コミット（`style: format with oxfmt`）。lint 修正で触った 4 ファイルだけは第 1 コミットで
  整形も同時に入っている。整形前後で `npm run build` の `dist` は
  `design-tokens.json`（`generatedAt`）を除き byte 一致

### CI

`build.yml`（required check「Build site」）に `Lint (oxlint)` と `Format check (oxfmt)` を足す。required check の
集合は変えない。`link-check-workflow.test.mjs` が 2 つの step の配線と `--deny-warnings` を固定する（`test:workflows` の
下限 79 → 80。`check-source-titles.test.mjs` の `WORKFLOW_TESTS` も同時に 80）。

## 帰結

- `.astro` のテンプレート部は整形されない。oxfmt が Astro を載せたら見直す
- oxfmt は 0.x。minor bump で整形規則が変わると `format:check` が赤になり、public リポの auto-merge は required job を
  待つので止まる。その回は `npm run format` を当てて commit する

## 撤回 / 再検討の条件

- oxfmt が `.astro` を扱えるようになったら、対象に含めるかを判断する
- Tailwind / Lightning CSS の出力が整形に依存しなくなったら、CSS を対象に戻す
