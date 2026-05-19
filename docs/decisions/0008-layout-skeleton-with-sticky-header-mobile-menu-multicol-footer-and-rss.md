# 0008. Layout skeleton: sticky Header + mobile menu + multi-col Footer + RSS

- 日付: 2026-05-19
- ステータス: 採択
- 関連 PR: feat/header-footer-meta-stage3

## 背景

PR #34(段階 1 = 設計トークン整列)・PR #35(段階 2 = ダークモード、ADR 0006)・PR #36(段階 2.5 = トップ法令目次化、ADR 0007)を経て、EduLaw JP は 10 ページ / 7 法令の最小構成で公開済となった。

ただし Layout skeleton(Header / Footer / メタタグ / フィード)は初期構築フェーズのまま簡素であり、姉妹サイト EduEvidence JP の Layout(557 行、site-header sticky / mobile drawer / 4 列 Footer / canonical / OG image / JSON-LD WebSite + Article + Breadcrumb / RSS link)と比較して以下の差分が残っている。

- ヘッダーが `position: static` で長文閲覧時にナビが画面外へ流れる
- モバイル幅での nav が横並びのまま圧縮され、タップ領域が狭い
- フッターが 1 列の連絡先列のみで、姉妹サイトへの導線が弱い
- canonical / OG image / Twitter Card(`summary_large_image`)/ 構造化データ(JSON-LD)/ RSS フィードが未配信で、検索結果・SNS シェア・フィードリーダーでの可視性が低い

段階 3 はこの Layout skeleton を姉妹サイトに揃え、ポータルとしての利便性と検出可能性を確保する。

セッション #48 末で「モバイルメニュー」と「RSS フィード」をスコープに追加する判断を行った(snappy-humming-mochi.md の段階 3 ベースに対する更新版 Plan = flickering-cuddling-mccarthy.md)。理由は、PR #36 でトップが法令ポータルとして再設計され、モバイルでのナビ折り畳みと法令更新時の `lastVerified` 駆動 RSS 配信を一体的に決定するほうが、整列の連続性が高いため。

## 決定

Layout skeleton を以下の 8 点で揃える。

1. **Header sticky + blur backdrop**
   - `position: sticky; top: 0; z-index: 50;`
   - `backdrop-filter: saturate(180%) blur(8px); background: color-mix(in oklab, var(--color-bg) 85%, transparent);`
   - `@supports not (backdrop-filter: blur(8px))` で `background: var(--color-bg)` フォールバック
   - `@media (prefers-reduced-motion: reduce)` で blur を無効化し不透明背景に切り替える(視覚酔いの低減)
   - ADR 0006 「Header sticky 導入時の z-index 再評価」条項に応答 — ThemeToggle / mobile drawer / `back-to-top` 等の他レイヤとの z-index 競合は本 ADR で固定する(Header `50` / mobile-menu `40` / その他は `< 40`)

2. **モバイルメニューは `data-state` + `aria-expanded` + `inert` のセマンティック属性駆動**
   - 修飾子クラス(`.menu--open`)は使わない(memory rule 6、ADR 0006 と整合)
   - 開時に `data-state="open"`、閉時に `data-state="closed"`
   - `aria-expanded` をハンバーガーボタンに同期、`aria-controls="mobile-menu"` で関連付け
   - 非表示時 `inert` を付与し、Tab が背後に漏れない
   - Esc キー閉じ / lg breakpoint(`(min-width: 1024px)`)で自動閉じ / 開時に drawer 内最初の項目へ `focus()`、閉時にハンバーガーへ `focus()` 復帰
   - body に `data-menu="open"` を付与し `overflow: hidden` でスクロールロック

3. **ThemeToggle はデスクトップ Header と モバイル drawer の 2 か所配置**
   - `<ThemeToggle id="theme-toggle" />`(デスクトップ)
   - `<ThemeToggle id="theme-toggle-mobile" />`(モバイル drawer)
   - 状態は `localStorage` 経由で同期、両ボタンの `aria-pressed` / `aria-label` を一括更新する inline script で揃える
   - `prefers-color-scheme` 変化時、localStorage 未設定なら両ボタン UI を追随

4. **Footer は `md:grid-cols-3` で 3 列**
   - 列 1「About」: Logo + wordmark + サイト説明
   - 列 2「Site」: 法令一覧 / サイトについて / 引用ポリシー / RSS フィード
   - 列 3「Sister Sites & Legal」: 姉妹サイト 3 件(自サイトに `aria-current="page"`)/ ライセンス / 連絡先 / コピーライト
   - 見出しは `font-mono text-xs uppercase tracking-widest`(姉妹サイト統一)

5. **メタタグは canonical / OG / Twitter / JSON-LD / RSS link を Layout.astro head で集約**
   - `<link rel="canonical">`: `new URL(Astro.url.pathname, Astro.site)`
   - `<meta property="og:image">`: 静的 1 枚(`/og-default.png`、1200×630)
   - `<meta name="twitter:card" content="summary_large_image">`(以前は `summary`)
   - JSON-LD: 全頁に `WebSite` + `Organization`(`sameAs` に姉妹サイト URL 配列)、法令詳細のみ `BreadcrumbList`
   - `<link rel="alternate" type="application/rss+xml" href="/rss.xml">`

6. **JSON-LD は `escapeLd()` で `<` を `<` にエスケープ**(memory rule 1 セキュリティ)
   - `JSON.stringify(obj).replace(/</g, "\\u003c")` で `</script>` インジェクション余地を消す
   - edu-evidence Layout.astro ミラー

7. **RSS は `lastVerified` を `pubDate` として `@astrojs/rss` で配信**
   - `/rss.xml.ts` endpoint、laws collection 全件
   - `pubDate` 降順ソート(更新法令がフィードリーダーで再浮上)
   - `customData: "<language>ja</language>"`

8. **OG 画像は静的 1 枚で開始**(`public/og-default.png`、1200×630、bg `#faf9f5` + 根モチーフ + wordmark)
   - Satori 動的生成(edu-evidence と同等の頁固有 OG)は将来 ADR で再検討
   - PR 起票時に PNG 化できない場合、SVG 1 枚で代替し、PNG 化を別 PR に切り出す可能性あり

## なぜ統合 1 本にしたか

Header / モバイルメニュー / Footer / メタタグ / RSS は「Layout skeleton 整列」という単一意図の下にあり、決定の根拠が共通する。

- 姉妹サイト UI/UX 統一 = memory rule 7
- セマンティック属性駆動 = memory rule 6
- JSON-LD `escapeLd()` / `mailto:` 正規化 / `new URL(..., Astro.site)` 境界明示 = memory rule 1
- 5 つを 3 本に分割すると索引性が下がり、撤回時の影響範囲も追いにくくなる

## 検証

- `npm run check`: 0 errors / 0 warnings(既存 19 hints は許容)
- `npm run build`: 11 pages built(従来 10 + `/rss.xml` 追加)
- Lighthouse Accessibility: ≥ 95 を目標、Tab フォーカス順 / コントラスト AA / `aria-expanded` 同期 / `inert` 非到達確認
- 視覚:320 / 768 / 1440 幅 × light / dark の手動確認(Plan §検証チェックリスト)
- セキュリティ:JSON-LD 出力に `<` が含まれず `<` にエスケープされていること

## 撤回再検討条件

- sticky Header が長文閲覧で視野を圧迫し画面占有の苦情が出た場合(scroll direction 検出による隠匿に切替検討)
- 各頁固有 OG が必要になった場合(Satori 動的生成へ移行する別 ADR を起票)
- RSS 購読が低調で `lastVerified` 駆動より「通知更新時の手動更新」のほうがニーズが高いと判明した場合

## スコープ外

- Reading Progress バー(edu-evidence 長文記事用)— 本サイトの法令詳細は中尺で Reading Progress 不要
- Back-to-top フローティングボタン — sticky Header があれば Home リンクで代替可
- 検索ボックス(Pagefind 等) — 7 法令の規模では nav 直接遷移で十分
- 用語ツールチップ(`.glossary-tip`)— 法令解釈には用語の独自定義を避ける立場(ADR 0002)

## 関連 ADR

- 0001(スタック)
- 0006(ダークモード、特に Header sticky 時の z-index 再評価条項)
- 0007(トップ法令目次化、Footer の Sister Sites 配置と整合)
