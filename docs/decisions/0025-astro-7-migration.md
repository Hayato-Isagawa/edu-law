# 0025. Astro 7 へ移行し XSS advisory 3 件を解消する(Markdown は `processor: unified()` で維持・edu-evidence ADR 0027 ミラー)

- 状態: 採用
- 日付: 2026-07-24
- 関連 PR: —(本 astro 7 移行 PR。作成後に追記)
- 関連 ADR: edu-evidence [ADR 0027](https://github.com/Hayato-Isagawa/edu-evidence/blob/main/docs/decisions/0027-astro-7-migration.md)(原本・heavy 経路の全体像)/ edu-watch ADR 0063(light 経路の姉妹事例)/ [`ADR 0023`](0023-visual-regression-testing.md)(VRT で移行を検証)

## 背景

Dependabot が astro 本体の XSS advisory を 3 件検知した(GHSA-f48w-9m4c-m7f5 / GHSA-7pw4-f3q4-r2p2 / GHSA-4g3v-8h47-v7g6)。修正版は **すべて 7.x のみで 6.x へのバックポートがなく**、「Astro 6 を維持する」ことと「advisory を塞ぐ」ことが両立しない。姉妹サイト edu-evidence(ADR 0027 / PR #384)・edu-watch(ADR 0063 / PR #427)が先行して同移行を実施済で、本 ADR はファミリー横展開の第 2 弾。

本サイトは過去に Dependabot PR #111(astro 6→7 + @astrojs/react 5→6)を試みたが、CI「Build site」が失敗して #115 で major ignore し延期した。失敗原因は **Astro 7 の既定 Markdown プロセッサが Sätteri に切り替わり `@astrojs/markdown-remark` を同梱しなくなる**ため、`markdown.rehypePlugins`(rehype-external-links)を使う既存構成が壊れることにある。edu-law は 12 法令を content collection の `render()` + `<Content />` で描画し(`src/pages/laws/[slug].astro`)、外部リンクの `target`/`rel` 付与を rehype に依存しているため、この破壊は看過できない。

## 検討した選択肢

1. **Astro 6 に留まり advisory を受容** — 修正版が 6.x に存在せず恒久的に未修正。棄却
2. **Astro 7 + 既定 Sätteri プロセッサに全面移行** — 外部リンク処理を Sätteri 向けに再実装するリスク・工数。棄却
3. **Astro 7 + `markdown.processor = unified()`** — 安定版 `@astrojs/markdown-remark` の `unified()` を明示指定し、従来の unified パイプライン(rehype-external-links)を温存する。edu-evidence で実証済。**採用**

## 決定(edu-law 固有)

1. `astro` を `^7.1.3`、`@astrojs/react` を `^6.0.1` へ上げる。edu-law は React island を 1 つも hydrate しない(`client:*` 0 件)ため react 統合の major 更新は実質無風。
2. `astro.config.mjs` で `markdown.processor` に `@astrojs/markdown-remark` の `unified()` を指定し、既存の `rehypePlugins`(rehype-external-links)をそのまま適用する。`@astrojs/markdown-remark` を deps に明示追加する。**edu-evidence と違い自作 remark プラグイン(chart/strategy-ref/glossary)を持たないため、`remarkPlugins` の追加も `unist-util-visit` も不要**。
3. `compressHTML: true` を明示する。Astro 7 は既定を `true` から `'jsx'` に変えており、VRT の差分を避けるため v6 挙動を固定する。
4. overrides の `vite` を `^7.3.2` から `^8.0.0` へ上げる(Astro 7 が vite `^8.0.13` を要求。据え置くと install が ERESOLVE する)。過去に vite 8 を避けた理由(`@tailwindcss/vite@4.2.2` の `tsconfigPaths` 非互換)は `@tailwindcss/vite@4.3.3` で解消済み。冗長になった `esbuild` override は削除する(vite 8 が esbuild 0.28.x に dedupe)。
5. `js-yaml` の blanket override(`^4.2.0`)は据え置く。edu-law のツリーに gray-matter は存在せず、edu-evidence が scoped 化した理由(gray-matter が js-yaml 4 で壊れる件)が発生しないため。js-yaml advisory GHSA-52cp-r559-cp3m は本サイトでは open alert ではない。
6. `dependabot.yml` の astro / @astrojs/react major ignore を削除する。vite の major ignore はコメントを更新のうえ残置(overrides 専用・次期メジャーは `@tailwindcss/vite` 対応まで据置)。typescript の ignore は `@astrojs/check` の peer 制約により残置。

## 帰結

- astro XSS 3 件が解消(`npm audit` から消失)。残る監査項目は dev / build ツール由来か、astro:assets 未使用で本番非到達(PR で実測)。
- **`rehypePlugins` は `processor: unified()` 下で deprecated 扱いとなる**が、Astro 7 でも引き続き適用されることを dist grep で実証する(法令ページの外部リンクに `target="_blank"` / `rel="noopener noreferrer"` が付くこと)。edu-evidence で既知債務としたのと同じ扱い。
- 過去 PR #111 の build 失敗は、`@astrojs/markdown-remark` の明示追加 + `processor: unified()` で根本解消する。
- 検証: `astro check` 0 errors・`npm run build` 成功・dist の外部リンク属性実証・VRT(astro.config 変更で CI 起動)でテンプレ代表ページがピクセル一致・(視覚差分が出た場合のみ)dev 目視サインオフ。実測値は PR に記載。
- 残る姉妹リポ(portfolio)も同一 advisory を抱えるが、本 ADR のスコープは edu-law のみ。portfolio は eslint 9 の別軸があり別 PR で対応する。

## 撤回 / 再検討の条件

- Sätteri / astro-compiler-rs の companion が 1.0 に到達し安定した時点で、`processor: unified()` 迂回を解消して既定プロセッサへ寄せるか再評価する。
- Astro が次の vite メジャーを採用したら、`dependabot.yml` の vite major ignore を外して追随を再評価する。
