# 0007. トップページを法令の目次・台帳として設計する(カード型から行型 + 3px アクセントバーへの置換)

- 状態: 採用
- 日付: 2026-05-19
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0001(初期スタックと BRAND.md ミラー方針)・0002(引用ルールと運用ポリシー)・0006(`data-theme` ダークモード)
- 姉妹サイト ADR: edu-evidence ADR 0007(セマンティック属性で UI 状態管理)・0008(直線 3px アクセントバーパターン)

## 背景

ADR 0006 で `data-theme` ダークモードを導入した時点で、トップページの基本構造は段階 1 の暫定状態(Hero + 法令カード 2 列 + 立場 + 姉妹サイトカード)のままだった。段階 2 完了後にユーザー指摘で 2 点の問題が顕在化:

1. **トップが薄い** — 法令 7 件をカード 2 列で並べるだけでは、訪問者が「ここで何ができるか」を即座に掴めない。教師が現場で抱える典型シナリオ(いじめ対応・教材コピー・保護者開示請求等)から関連法令へ降りる導線が無い
2. **法令にカード型は合わない** — エビデンス(教科指導)向けに最適化された `rounded-md` カード語彙が、目次・台帳的性質を持つ法令ポータルにそぐわない。「読んで考える」エビデンスと「索引する」法令ではセクション機能が異なる

姉妹サイト edu-evidence は ADR 0008 で「直線 3px アクセントバー + 矩形 row」パターンを確立しており(`StrategyRow.astro` / `.strategy-row`)、法令ポータルの「台帳・目次」性質と語彙的に整合する。

## 検討した選択肢

### A) 法令カード 2 列を維持し、シナリオセクションのみ追加

- 利点: 既存実装を残せる、変更が最小限
- 欠点: 視覚言語の根本問題(エビデンス向け語彙の流用)が残る。法令と姉妹サイトを別語彙で扱うため統一感が出ない

### B) 行型 + 3px アクセントバーに置換(採用)

- 利点:
  - edu-evidence StrategyRow パターンをミラーして語彙統一(memory rule 7)
  - 「台帳・目次」性質を視覚化(序番 `01/07` + 主見出し + メタ情報の 3 カラム構造)
  - 1 ページに 4 セクション(典型シナリオ / 7 法令 / 公式解説 Highlights / 姉妹サイト)を同じ語彙で並べられる
  - 矩形 row + 直線 3px は memory rule 9(rounded カードに 3px は使わない)のスコープ内
- 欠点:
  - LawRow コンポーネント新設で追加ファイル発生
  - global.css に `.law-row` セレクタ + publisher バッジトークン追加

### C) Tab UI で法令カテゴリ別に切り替え

- 利点: 7 法令を「学校運営系 / 児童保護系 / 表現規制系」等で分類できる
- 欠点: Tab UI は JS が必要、初回訪問者にとって「全体像」が一望できない。法令 7 件は Tab を要するほど多くない

## 決定

**方式 B** を採用。実装は次の規約に従う。

### セクション構造(6 セクション)

```
Hero(CTA「7 法令の入口を見る」)
  ↓
① 典型シナリオ → 関連法令(6 row、シナリオから入る導線)
  ↓
② 整理対象の 7 法令(7 row、法令名から入る導線)
  ↓
③ 公式解説 Highlights(4-6 row、publisher 別代表)
  ↓
④ 本サイトの立場(3 つの編集方針 + 立場ステートメント)
  ↓
⑤ Sister Sites(3 row、自サイト含む)
```

### LawRow.astro 設計

汎用 row コンポーネントとして 4 セクション(7 法令 / シナリオ / Highlights / Sister Sites)で再利用。

Props:

- `index: number` — 序番(1-based)
- `total: number` — 全件数
- `href: string` — リンク先
- `title: string` — 主見出し
- `summary?: string` — サブテキスト
- `badge?: 'mext' | 'cfa' | 'bunkacho' | 'egov' | 'leaf' | 'sprout' | 'root'` — publisher または姉妹サイトメタファー
- `meta?: string` — 右端メタ(lastVerified / 公式解説数 / カテゴリ名)
- `variant?: 'law' | 'scenario' | 'highlight' | 'sister'` — セクション別の見え方分岐
- `isCurrent?: boolean` — Sister Sites で自サイト(edu-law)を「現在地」として示す用

Grid 12 列構造(StrategyRow ミラー):

- 左 col-span-2(モバイル col-span-2): 序番 `01/07`(font-mono、`[data-num]`)
- 中央 col-span-7(モバイル col-span-10): title + summary + badge
- 右 col-span-3(モバイル col-span-12 折り返し): meta + 矢印(現在地は `◉`、それ以外は `→`)

`isCurrent={true}` の row は `aria-current="page"` 付与 + href を無効化(`<div>` レンダリング)+ `◉` 表示。memory rule 6 に従い修飾子クラス `.law-row--current` は使わない。

### `.law-row` CSS(edu-evidence `.strategy-row` ミラー)

```css
.law-row {
  position: relative;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-line);
  text-decoration: none;
  color: inherit;
  transition: background-color 200ms ease-out;
}
.law-row:last-of-type {
  border-bottom: 1px solid var(--color-line);
}
.law-row::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--color-accent);
  transform: scaleY(0);
  transform-origin: top center;
  transition: transform 250ms ease-out;
  pointer-events: none;
}
.law-row:hover {
  background: var(--color-card);
}
.law-row:hover::before,
.law-row:focus-visible::before {
  transform: scaleY(1);
}
@media (prefers-reduced-motion: reduce) {
  .law-row::before {
    transition: none;
  }
}
```

edu-evidence `.strategy-row` との差分:

- `display: grid` + `grid-template-columns: repeat(12, ...)` をクラス側に持つ(StrategyRow は `<div class="grid grid-cols-12">` をマークアップ側に持つが、LawRow は `<a class="law-row">` 自体を grid root にする)
- `:focus-visible::before` を追加(キーボードユーザーへの a11y 強化)
- `border-top` / `border-bottom` をクラス側で持ち、セクション内で連続描画

### publisher バッジ土色 4 段トークン

```css
:root {
  --badge-mext: #8b6f4e;
  --badge-cfa: #a07642;
  --badge-bunkacho: #6f6a3e;
  --badge-egov: #5e5a52;
}
[data-theme="dark"] {
  --badge-mext: #c6a880;
  --badge-cfa: #d4a574;
  --badge-bunkacho: #a8a472;
  --badge-egov: #908a80;
}
```

バッジは `border + 薄背景` の 3 層構造(text/border/bg)。`font-mono` + `tracking-widest` + `uppercase`。

土色 4 段の根拠: ADR 0001 で確定した茶アクセント `#6b4423` の周辺色相を維持しつつ、4 つの publisher を識別可能な範囲で分散させた。緑系・赤系・青系を避け、サイト全体の落ち着いた質感(根モチーフの土色)を保つ。

### 立場リライト(3 つの編集方針、ポジティブ並び)

現状(ネガティブ並び):

- 自前の法解釈は加えません
- 公式 URL への入口に徹します
- 引用は政府標準利用規約に従います

新案:

1. **公式 URL までの最短経路を整理する** — e-Gov / mext / cfa / bunkacho の散らばった解説を 1 ページに集約
2. **公式解説の見出し構造を提示する** — 解釈は付けず、項目の場所と所管を示す
3. **引用は政府標準利用規約 第 2.0 版に準拠する** — 出典・URL・取得日を必須明記

末尾に立場ステートメント(残す):

> 本サイトは独自の法解釈を加えません。判断が必要な場面では、所管庁・教育委員会・法務担当者にご相談ください。

ADR 0002 の引用ルール本体は変更しない。本変更はトップ表示のフレーミングのみ。

### 「6 法令」表記バグの同期修正

`getCollection("laws")` は実際 7 件返している(ADR 0005 で児童福祉法追加済)。トップ表記が実装に追随していなかったため、本 PR で同期:

| 箇所 | 修正前 | 修正後 |
|---|---|---|
| `src/pages/index.astro` CTA | 「6 法令の入口を見る」 | 「7 法令の入口を見る」 |
| `src/pages/index.astro` 見出し | 「整理対象の 6 法令」 | 「整理対象の 7 法令」 |
| `README.md` 初期スコープ | 「初期スコープ — 6 法令」 | 「初期スコープ — 7 法令」(児童福祉法も列挙に追記) |

## アクセシビリティ

- **WCAG SC 2.4.3 Focus Order**: row の Tab 順は DOM 順に従う。序番 → 内容 → メタの視線順と一致
- **WCAG SC 2.4.7 Focus Visible**: `:focus-visible` で 3px アクセントバーが出現、追加で `:focus-visible` outline は親 `:root` ルールで継承
- **WCAG SC 2.5.5 Target Size**: row の高さは padding 1.25rem(20px)上下 = 約 64px 以上を確保、44×44px 最小タップ領域を超える
- **WCAG SC 1.4.3 Contrast (Minimum)**: 土色バッジ 4 段は light/dark とも `--color-bg` 背景で AA(4.5:1)を満たす値を採用
- **WCAG SC 4.1.2 Name, Role, Value**: `isCurrent={true}` の row は `aria-current="page"` で現在地を支援技術に伝える
- **prefers-reduced-motion**: `::before` の transform transition を `none` 化(`.law-row` / `.strategy-row` で同一実装)

## 帰結

### 良い帰結

- トップが「法令の目次・台帳」として機能し、訪問者が課題(典型シナリオ)から関連法令へ最短経路で降りられる
- 視覚言語が edu-evidence StrategyRow に準拠した行型 + 3px アクセントバーで統一され、サイト全体の落ち着いた質感を獲得(memory rule 7)
- 「6 法令 → 7 法令」表記バグが解消、ADR 0005 の追加が表側にも反映される
- LawRow を汎用化したことで、後続の公式解説一覧ページ・カテゴリ別索引ページでも再利用可能

### トレードオフ / 既知のリスク

- LawRow.astro 新規 + global.css 拡張で初期実装コスト発生(段階 3 = Header sticky の前にこの転換を入れる判断)
- 典型シナリオ 6 件はトップ実装のため `src/pages/index.astro` 内にハードコード。コンテンツコレクション化は将来別 ADR で検討(7 法令データが `src/content/laws/` 駆動なのと非対称)
- publisher バッジ土色 4 段は、edu-evidence の eef/japan/hattie 3 色バッジとは独立した色系列。姉妹サイト間で「同じバッジ語彙」は意図的に避けた(法令と研究では publisher の意味が異なるため)

## 撤回 / 再検討の条件

- 典型シナリオセクションが「自前解釈に見える」とユーザー指摘を受けた場合、シナリオ文言を「場面 → 関連法令名のリストのみ」まで切り詰める ADR を起こす(現状でも summary に法令名のみ列挙、解釈文は書かない方針)
- 段階 3 で Header sticky / モバイルメニューを導入する際、LawRow の hover 領域と Header の z-index 競合を再評価する
- 公式解説 Highlights セクションを将来「Top 4-6 件の動的選定アルゴリズム」化する場合、本 ADR の「実装時にハードコード選定」方針を撤回し、新規 ADR で選定基準を記録する

## スコープ外(本 PR では触れない)

- 段階 3: Header sticky / モバイルメニュー / Footer 多列化 / OGP・JSON-LD・RSS 拡充
- 段階 4: Hero の本格的視覚調整(画像・モーション)
- LawRow のフィルタ / 並び替え機能
- 公式解説ページ(`/laws/{slug}/`)本文側のレイアウト変更
- 第三者ライブラリ追加・依存更新

## 関連参照

- 本サイト ADR 0001(初期スタックと BRAND.md ミラー方針、`--color-accent` `#6b4423` の制定根拠)
- 本サイト ADR 0002(引用ルールと運用ポリシー、立場ステートメントの根拠)
- 本サイト ADR 0005(児童福祉法を初期スコープに追加、「7 法令」採番の根拠)
- 本サイト ADR 0006(`data-theme` ダークモード、publisher バッジ dark トークンの基盤)
- edu-evidence ADR 0007(セマンティック属性で UI 状態管理、`aria-current` 採用根拠)
- edu-evidence ADR 0008(直線 3px アクセントバーパターン、`.law-row` のミラー元)
- memory rule 6(セマンティック属性で UI 状態管理)
- memory rule 7(姉妹サイト UI/UX 統一)
- memory rule 9(直線 3px アクセントバーは矩形リスト要素のみ)
