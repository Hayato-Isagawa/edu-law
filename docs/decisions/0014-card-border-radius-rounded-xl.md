# 0014. カード border-radius を rounded-xl に統一(姉妹サイト規約の継承)

- 日付: 2026-05-26
- ステータス: 採択
- 関連 PR: style/card-radius-rounded-xl

## 背景

EduLaw JP は箱型カード(4 辺 border + padding でカードとして読める面)の角丸が未統一だった。トップ(`src/pages/index.astro`)の 2 入口カードは角張り(radius なし)、法令詳細(`src/pages/laws/[slug].astro`)の「公式情報源への入口」ボックス(`bg-[var(--color-card)]` + border + padding)は `rounded-md`、と混在していた。

姉妹サイト EduEvidence JP は、同型の箱型カードに一貫して `rounded-xl` を使用している。

- `src/components/RelatedStrategyCard.astro`(`group block border border-[var(--color-line)] rounded-xl p-5 …`)
- `src/pages/index.astro`(`bg-[var(--color-card)]` を持つ関連カードも `rounded-xl`)

3 サイト(葉=EduEvidence / 双葉=EduWatch / 根=EduLaw)は Layout・コンポーネント・グローバル CSS を共通基盤として揃える方針であり、カードの角丸が site 間で食い違うのは意図しない差分にあたる。

## 決定

箱型カードの角丸を姉妹サイト規約に揃え、以下を EduLaw の規約とする。

| 要素 | radius |
|---|---|
| 箱型カード(full border + padding) | `rounded-xl` |
| 内側の小ボックス | `rounded-lg` |
| バッジ・ピル・CTA | `rounded-full` |
| TOC(目次ボックス) | `rounded-md` |

本 PR では現存する箱型カード 3 要素を `rounded-xl` に統一する。

1. `src/pages/index.astro` 入口カード「子供への指導・対応」(radius なし → `rounded-xl`)
2. `src/pages/index.astro` 入口カード「教師を守る」(radius なし → `rounded-xl`)
3. `src/pages/laws/[slug].astro` 「公式情報源への入口」ボックス(`rounded-md` → `rounded-xl`)

`border-b` のみの行スタイル(法令一覧 `src/pages/laws/index.astro` の `<li>`、ガイド一覧・`/protect-teachers/` の `<article>`)は、4 辺 border を持たず箱型カードではないため radius の対象外とする。バッジ(`src/components/LawRow.astro` の publisher バッジ)は既に `rounded-full` で規約どおり。

## なぜこの判断にしたか

- **`rounded-xl` を基準にする理由:** 姉妹サイトの確立済みの値であり、3 サイト共通基盤の一貫性を保てる。新規に値を選ぶより既存規約の継承が妥当
- **slug ボックスを `rounded-md` から変える理由:** `rounded-md` は TOC 用の値。当該ボックスは `bg-[var(--color-card)]` を持つ箱型カードであり、TOC ではない。箱型カードに TOC の radius が当たっていたのは不整合で、`rounded-xl` が正しい
- **行スタイルを対象外にする理由:** `border-b` の行は区切り線であってカード面ではない。角丸は「面の角」を丸める指定であり、下線のみの行に付けても視覚的意味を持たない

## 検証

- `npm run check`: 0 errors / 0 warnings
- `npm run build`: 20 ページ維持
- `dist` grep: トップ入口 2 カードと法令詳細の入口ボックスに `rounded-xl` が出力・当該ボックスから `rounded-md` が消失・border-b 行に radius が付いていないこと

## 撤回・再検討の条件

- 姉妹サイトが箱型カードの radius 規約を変更した場合 → 追随を別 ADR で検討する
- 新たなカード種別(例: 画像主体のメディアカード)が登場し `rounded-xl` が視覚的に不適切になった場合 → 種別ごとの radius を別 ADR で定義する

## 関連 ADR

- 0008(レイアウト骨格 — 共通基盤のコンポーネント方針)
- 先例: EduEvidence JP ADR 0008(直線アクセントバーの適用範囲 — UI の横断規約を ADR 化するスタイル)
