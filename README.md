# EduLaw JP

日本の小学校教員向けに、教育関連法と公式解説(文科省・文化庁・厚労省・e-Gov)を法令別に整理するポータルサイト。EduEvidence JP / EduWatch JP の姉妹サイト。

**https://law.edu-evidence.org**(準備中)

## 設計の核

- **自前の法解釈はしない。** サイトが提供するのは「法令本文への e-Gov リンク + 公式解説の見出し整理 + 公式 URL への誘導」のみ
- 法解釈・現場助言は弁護士・行政書士の領域。本サイトはそれらへの **入口** を整理することに徹する
- 引用は **公共データ利用規約 第 1.0 版** の範囲内に限り、出典・URL・取得日を必ず明記する

## 対象法令 — 11 法令

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

## 技術スタック

| 分類 | 技術 |
|------|------|
| フレームワーク | [Astro](https://astro.build/) 6 |
| UI | [React](https://react.dev/) 19 + [Tailwind CSS](https://tailwindcss.com/) 4 |
| 言語 | TypeScript |
| ホスティング | [Cloudflare Pages](https://pages.cloudflare.com/) |
| ドメイン | `law.edu-evidence.org`(edu-evidence.org サブドメイン) |

## セットアップ

Node.js 24 系を `.tool-versions` で固定(`nodejs 24.15.0`)。[mise](https://mise.jdx.dev/) を推奨。

```bash
git clone https://github.com/Hayato-Isagawa/edu-law.git
cd edu-law

mise install   # .tool-versions に従って Node 24 を導入
npm ci         # 依存関係をロックから厳密復元

npm run dev    # 開発サーバー(localhost:4321)
npm run build  # 本番ビルド
npm run check  # Astro 型チェック
```

## ディレクトリ構成

```
src/
├── layouts/        # 共通レイアウト
├── pages/          # Astro ページ
└── styles/         # グローバル CSS

docs/
├── BRAND.md            # 5 サイト共通ブランドガイド(姉妹サイトとミラー)
├── context-management.md
└── decisions/          # ADR(意思決定記録)

public/
├── _headers        # Cloudflare Pages セキュリティヘッダー
├── favicon.svg     # プレースホルダー(根モチーフ実装は別 PR)
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

**Isagawa Hayato** — 元小学校教諭(2011-2023、勤務約 11 年)
