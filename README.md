# EduLaw JP

日本の小学校教員向けに、教育関連法と公式解説(文科省・文化庁・厚労省・e-Gov)を法令別に整理するポータルサイト。EduEvidence JP / EduWatch JP の姉妹サイト。

**https://law.edu-evidence.org**

## 設計の核

- **自前の法解釈はしない。** サイトが提供するのは「法令本文への e-Gov リンク + 公式解説の見出し整理 + 公式 URL への誘導」のみ
- 法解釈・現場助言は弁護士・行政書士の領域。本サイトはそれらへの **入口** を整理することに徹する
- 引用は **公共データ利用規約 第 1.0 版** の範囲内に限り、出典・URL・取得日を必ず明記する

## 収録コンテンツ

教師が直面する場面から必要な法令・公式解説にたどり着けるよう、3 つの入口で構成する。

- **場面から探す**(`/scenes/`) — いじめ・保護者対応・心の不調・懲戒・不登校・感染症対応など 5 カテゴリ 19 場面から、関係する法令とガイドへ誘導する(ADR 0018)
- **法令から探す**(`/laws/`) — 下記 12 法令。各ページに e-Gov 本文リンクと公式解説の見出し整理を置く
- **教師向けガイド**(`/guides/`) — 基礎 1 本(法令の階層)と「教師を守る」10 本を性質別 3 グループに整理する(ADR 0016)

## 対象法令 — 12 法令

現場照会頻度順:

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

## 技術スタック

| 分類 | 技術 |
|------|------|
| フレームワーク | [Astro](https://astro.build/) 7 |
| UI | [React](https://react.dev/) 19 + [Tailwind CSS](https://tailwindcss.com/) 4 |
| 言語 | TypeScript |
| ホスティング | [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/)(静的アセット配信) |
| ドメイン | `law.edu-evidence.org`(edu-evidence.org サブドメイン) |

## セットアップ

Node.js 24 系を `.tool-versions` で固定(`nodejs 24.19.0`)。[mise](https://mise.jdx.dev/) を推奨。

```bash
git clone https://github.com/Hayato-Isagawa/edu-law.git
cd edu-law

mise install   # .tool-versions に従って Node 24 を導入
npm ci         # 依存関係をロックから厳密復元

npm run dev    # 開発サーバー(localhost:4324。ファミリー各リポで固定・4321 は未設定プロジェクト用に空けている)
npm run build  # 本番ビルド
npm run check  # Astro 型チェック
```

## ディレクトリ構成

```
src/
├── components/     # UI 部品(SiteHeader / SiteFooter / Logo / LawRow ほか)
├── content/        # 法令コンテンツコレクション(法令別 Markdown 12 本)
├── data/           # scenes.ts(場面定義) / changelog.ts / publishers.ts
├── layouts/        # 共通レイアウト
├── pages/          # Astro ページ(laws / guides / scenes / about / changelog)
└── styles/         # グローバル CSS

docs/
├── BRAND.md            # 5 サイト共通ブランドガイド(姉妹サイトとミラー)
├── context-management.md
├── freshness-audit.md  # 鮮度管理 3 層(lychee / stale-check / 棚卸し手順)
├── decisions/          # ADR(意思決定記録)
└── security/           # セキュリティ関連ドキュメント

public/
├── .assetsignore   # Workers の配信対象から外すもの
├── _headers        # セキュリティヘッダー
├── _redirects      # 旧 URL からの 301(場面軸 IA 移行)
├── favicon.svg     # 最小ブランドマーク(根モチーフ本体は src/components/Logo.astro)
├── logo.svg
├── og-default.png  # OG 画像(1200×630)
└── robots.txt
```

## ブランド

- **モチーフ**: 根(root)。EduEvidence JP(葉)・EduWatch JP(双葉)と対になる
- **アクセント色**: 茶 `#6b4423`(`--color-accent`)
- 詳細は [`docs/BRAND.md`](docs/BRAND.md)(姉妹サイト共通)を参照

## 連絡先

`law@edu-evidence.org`(個人 Gmail に転送)

## ライセンス

- コード: [MIT](LICENSE)
- 独自整理コンテンツ: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ja)
- 公式解説引用部分: [公共データ利用規約 第 1.0 版](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0) に従う

## 著者

**Isagawa Hayato** — 元小学校教諭(2011-2022、実勤務約 10 年)
