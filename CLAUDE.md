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
npm run check    # Astro 型チェック
npm run vrt      # ビジュアルリグレッションテスト(現 dist を撮影・比較。権威ある比較は CI、後述)
```

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

- **設定**: `playwright.vrt.config.ts`(`testDir: vrt/`、desktop 1280 / mobile 390 の 2 projects、`maxDiffPixelRatio: 0.01`、アニメーション無効)
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
