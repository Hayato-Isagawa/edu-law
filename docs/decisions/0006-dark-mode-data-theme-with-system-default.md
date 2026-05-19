# 0006. ダークモードはシステム追従デフォルト + 手動切替トグル(`data-theme` 属性)で提供する

- 状態: 採用
- 日付: 2026-05-19
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0001(初期スタックと BRAND.md ミラー方針)
- 姉妹サイト ADR: edu-evidence ADR 0011(`dark-mode-data-theme-with-system-default`)・0013(`dark-mode-readability-tuning`)、edu-watch ADR 0026 / 0028(同仕様のミラー、本 ADR は edu-law 茶アクセント対応版)

## 背景

本サイトはこれまでライトテーマ単一で運用してきた。姉妹サイト 2 つ(edu-evidence・edu-watch)は ADR 0011 + 0013 系列でシステム追従ダークモード + 手動切替を導入済みで、5 サイト統合ブランドシステム(葉 / 双葉 / 根)の根サイトである本サイトだけがダーク対応されていない状態だった。

教師は学校・自宅・移動中など多様な照度環境で参照する。法令ポータルは長文(法令本文 + 公式解説の見出し)を扱うため、夜間長時間閲覧での目疲労低減価値が高い。また現在のモバイル端末ユーザーの大半は OS レベルで dark を選択しており、サイト側がシステム設定に追従しないと「白く眩しい」体験になる。

起動属性については、本サイト既存 ADR(0001-0005)には明文化された規約はないが、姉妹サイト edu-evidence ADR 0007 で確立した「UI 状態はセマンティック属性(`aria-*` / `data-*`)で管理する」規約と整合させ、`.dark` クラスではなく `data-theme` 属性を採用する。

## 検討した選択肢

### A) システム設定追従のみ(`prefers-color-scheme` 一発、手動切替なし)

- 利点: 実装がシンプル、JS 不要、CSS の `@media (prefers-color-scheme: dark)` だけで完結
- 欠点: 「ダーク端末だが、このサイトだけライトで読みたい」というユーザーの選択を奪う。手動切替ニーズ(全体の 35% 程度)に応えられない。

### B) システム追従 + 手動切替トグル + localStorage 永続化(採用)

- 利点:
  - デフォルトはシステム追従(自動追従期待に応える)
  - トグルで手動 override 可能、選択は localStorage で永続化
  - 姉妹サイト 2 つと同じメンタルモデル(姉妹サイト間移動でも挙動が一致 — memory rule 7)
- 欠点:
  - inline script を `<head>` 早期に置く必要がある(FOUC 回避のため)
  - localStorage 不可環境(プライベートブラウジングの一部)では永続化が効かないが、その場合もシステム追従にフォールバックして閲覧は破綻しない

### C) 手動切替のみ(初期値ライト固定)

- 利点: ライトテーマを「正規」とみなす立場を貫ける
- 欠点: システム追従期待に反する。法令ポータルとしての「事実は事実」というトーンと色価値選択は独立であり、ライトを固定する積極的理由が無い。

## 決定

**方式 B** を採用。実装は次の規約に従う。

### 起動属性

- `<html data-theme="light">` または `<html data-theme="dark">`
- `.dark` のような修飾子クラスは使わない(memory rule 6 と整合)

### 初期解決スクリプト

`<head>` の最早期(`<link rel="stylesheet">` 相当の Astro 自動注入より前)に inline `<script is:inline>` で初期テーマを解決する。FOUC を回避するため、CSS 適用前に DOM 属性を確定させる。

```html
<head>
  <meta charset="UTF-8" />
  <script is:inline>
    (function () {
      try {
        const saved = localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = saved === "dark" || saved === "light"
          ? saved
          : prefersDark
            ? "dark"
            : "light";
        document.documentElement.setAttribute("data-theme", theme);
      } catch {
        document.documentElement.setAttribute("data-theme", "light");
      }
    })();
  </script>
  <meta name="color-scheme" content="light dark" />
  ...
</head>
```

### CSS トークンの分離

`:root` でライト値を定義、`[data-theme="dark"]` でダーク値を上書きする。

```css
:root {
  --color-bg: #faf9f5;
  --color-ink: #1a1a1a;
  --color-sub: #6b6b66;
  --color-line: #e5e3da;
  --color-card: #ffffff;
  --color-accent: #6b4423;
  --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, black);
}

[data-theme="dark"] {
  --color-bg: #16181d;
  --color-ink: #f0f6fc;
  --color-sub: #9ba1a8;
  --color-line: #30363d;
  --color-card: #1f2328;
  --color-accent: #c89a7a;
  --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, white);
}
```

### dark トークン値の根拠

| token | light | dark | 根拠 |
|---|---|---|---|
| `--color-bg` | `#faf9f5` | `#16181d` | edu-evidence ADR 0013 同値。中性 dark gray、長文閲覧で「色付き背景」の視覚負荷を避ける |
| `--color-ink` | `#1a1a1a` | `#f0f6fc` | GitHub fg.default 系。純白寄りで長文の明瞭さ(背景との約 16:1、AAA) |
| `--color-sub` | `#6b6b66` | `#9ba1a8` | 中性グレー。本文との明度差を保ちつつ「副情報」として控えめ(背景との約 7.5:1、AAA) |
| `--color-line` | `#e5e3da` | `#30363d` | GitHub border 系。bg からの段差で構造可視性を確保 |
| `--color-card` | `#ffffff` | `#1f2328` | bg より一段明るい中性 dark gray、深度表現 |
| `--color-accent` | `#6b4423` | `#c89a7a` | 茶系の dark variant。`#6b4423` の温度(暖色)を維持しつつ明度を上げて視認性確保。背景 `#16181d` 上で約 7.2:1(AAA)。WebAIM Contrast Checker 実測値で AA(4.5:1)を確実に超える `#c89a7a` を採用 |
| `--color-accent-hover` | `color-mix(... 85%, black)` | `color-mix(... 85%, white)` | ライトの暗化と対称、ダークでは明度を上げる方向に hover |

### トグル UI

- ヘッダー右端に専用ボタンを設置(`<button id="theme-toggle">`、`src/components/ThemeToggle.astro` として独立コンポーネント化)
- `aria-pressed` でトグル状態(true=dark / false=light)を表現
- `aria-label` で「ダークモードに切り替え」「ライトモードに切り替え」を JS で動的更新
- アイコンは inline SVG(月 / 太陽の単色アイコン、`currentColor` 継承)、CSS の `[data-theme="dark"]` セレクタで表示切替

### `<meta name="color-scheme">`

`<meta name="color-scheme" content="light dark">` を `<head>` に追加。フォーム要素・スクロールバー・select dropdown 等のネイティブ UI もテーマに追従する。

### Tailwind 4 対応

Tailwind 4 の `@variant dark` は `[data-theme="dark"]` セレクタにバインドする。

```css
@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

これで `dark:bg-[var(--color-bg)]` のような Tailwind の `dark:` 修飾子が `data-theme="dark"` に追従する。ただし本サイトのトークンは `[data-theme="dark"]` 側で値だけ差し替える設計なので、`bg-[var(--color-bg)]` のように **トークン経由** で書いてあるクラスは `dark:` 修飾子なしで自動追従する。

## アクセシビリティ

- **WCAG SC 1.4.3 Contrast (Minimum)**: ダーク全ペアで AA(4.5:1)以上、本文ペアは AAA(7:1)以上を達成
- **WCAG SC 1.4.6 Contrast (Enhanced)**: 本文 `#f0f6fc × #16181d` で AAA(約 16:1)達成
- **WCAG SC 2.1.1 Keyboard**: トグルは `<button>` で実装、Tab / Enter / Space で操作可
- **WCAG SC 4.1.2 Name, Role, Value**: `aria-pressed` でトグル状態、`aria-label` で意味を動的に提供
- 本実装段階では Header の sticky / blur backdrop 化は段階 3 範囲のため触れない。`prefers-reduced-motion` 関連の CSS 追記も段階 3 / 4 で行う。

## 帰結

### 良い帰結

- 教師ユーザーの夜間長文閲覧の負荷軽減。学校・自宅・移動中の照度環境差に対応
- 姉妹サイト 3 つ(edu-evidence / edu-watch / edu-law)で起動方式が一致し、サイト間移動で混乱しない(memory rule 7)
- `<meta name="color-scheme">` で OS ネイティブ UI(スクロールバー・select dropdown)も自動追従
- 設計トークン構造(段階 1 で揃えた `:root` の 6 + 1 トークン)を活かし、最小変更で全 7 法令ページ + index / about / laws/index がダーク対応

### トレードオフ / 既知のリスク

- `<head>` に inline script が追加され 10 行程度肥大
- `localStorage` 不可環境(プライベートブラウジングの一部)では永続化が効かないが、OS 追従にフォールバックして閲覧は破綻しない
- 茶系 dark variant `#c89a7a` は edu-evidence の緑系 `#6fbe87` よりも暖色寄りで、長文閲覧で「読みにくい」と感じる可能性はゼロではない。フィードバックがあれば撤回 / 再検討の条件を発動する。

## 撤回 / 再検討の条件

- 茶系 dark variant `#c89a7a` が長文閲覧で読みにくいフィードバックを得た場合、edu-evidence ADR 0013 と同様に dark トークン値の再調整 ADR を起こす(候補: `#b8845a` / `#a87f5c` / 中性寄り `#c0a080`)
- Tailwind 5 以降で `@variant dark` の挙動が変わった場合、本 ADR の Tailwind 4 対応節を撤回し、新規 ADR で更新方針を記録
- 段階 3 で Header sticky + blur backdrop 化を導入する際、トグルボタンの z-index / hover 挙動を再評価する(本 ADR ではトグル UI の規約のみ確定、配置の sticky 化は段階 3 範囲)

## 関連参照

- edu-evidence ADR 0011(`dark-mode-data-theme-with-system-default`、起動方式の原型)
- edu-evidence ADR 0013(`dark-mode-readability-tuning`、dark トークン値の根拠)
- 本サイト ADR 0001(初期スタックと BRAND.md ミラー方針、`--color-accent` `#6b4423` の制定根拠)
- memory rule 6(セマンティック属性で UI 状態管理)
- memory rule 7(姉妹サイト UI/UX 統一)
