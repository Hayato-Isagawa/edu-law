# 0001. 初期スタックと BRAND.md ミラー方針の採択

- 状態: 採用
- 日付: 2026-05-06
- 関連 PR: #1(本リポジトリの初期立ち上げ PR)

## 背景

EduLaw JP は教師向けに教育関連法と公式解説を法令別に整理する新規サイト(姉妹サイト: EduEvidence JP / EduWatch JP)。立ち上げにあたり以下を同時に確定する必要があった:

1. **技術スタック** — 姉妹サイトとの一貫性 vs 立ち上げの軽量さのバランス
2. **ブランドガイドの取り扱い** — 独自に新規作成 vs 姉妹サイトと共有
3. **初期コンテンツの構造** — 全機能フル装備 vs Coming Soon 最小

これらを 3 つの ADR に分けると初期 PR の文脈が分散する一方で、いずれも姉妹サイトの実装と運用ルールを起点とする決定であり、まとめて 1 ADR とする方が後続セッションが背景を再構成しやすい。

## 検討した選択肢

### 1. 技術スタック

- **A) edu-evidence のフルコピー**: textlint / Pagefind / Satori OG 画像生成 / Playwright / 用語ツールチップ等を含む。立ち上げ時に重く、edu-law の文脈で不要な機能(用語ツールチップは法解説では混乱を招く可能性)もある。
- **B) edu-evidence のスタック踏襲、機能は最小から段階導入**: Astro 6 + React 19 + Tailwind 4 + TypeScript + sitemap のみ。スタック互換性は維持しつつ、立ち上げ時の保守負担を最小化する。
- **C) ゼロから別スタック構築**: 一貫性が崩れ、姉妹サイト共通の hooks や ADR テンプレートを使えなくなる。

### 2. BRAND.md の取り扱い

- **A) 独自に新規作成**: 5 サイト体系の整合性が崩れるリスク。
- **B) edu-evidence の `docs/BRAND.md` を完全ミラー**(コミット d206ea0 時点): 姉妹サイト共通の真実(single source of truth)を維持。更新時は edu-evidence 側で更新後、各リポにコピーする運用。

### 3. 初期コンテンツ

- **A) 6 法令ページのフル雛形を初期 PR で展開**: レビュー範囲が広く、引用ルール ADR が未確定の状態で本文の引用を含むコンテンツを書くと、整合性確保が難しい。
- **B) Coming Soon ページのみ + 6 法令はスコープを示すリスト**: スタックと運用方針の検証に集中、コンテンツ着手は引用ルール ADR(別 PR)後。

## 決定

- **スタック**: B 案 — Astro 6 / React 19 / Tailwind 4 / TypeScript / sitemap、edu-evidence と同一の主要バージョン。OG 画像生成・用語ツールチップ・全文検索などの便利機能は採用しない(必要になった時点で個別 PR で移植)。
- **BRAND.md**: B 案 — edu-evidence の `docs/BRAND.md` をコミット d206ea0 時点でフルミラー。同一内容を `docs/BRAND.md` として配置し、edu-evidence 側で更新があった際は本リポジトリと edu-research にコピーする。
- **初期コンテンツ**: B 案 — `src/pages/index.astro` を Coming Soon 最小、6 法令は対象スコープを示すリストのみ。本文の引用は引用ルール ADR(別 PR)確定後に着手。

加えて以下を初期 PR で同時に整備する:

- AI 防御フック 3 本: `branch-guard.sh`(`main` への直接編集禁止)、`pre-compact.sh`(active.md dump)、`post-compact.sh`(再読込リマインダー)
- `.claude/state/active.md`(`.gitignore` 配下、生きたチェックポイント)
- `docs/context-management.md`(ファイル化されたコンテキスト管理ルール、姉妹サイトと共通テンプレート)
- ロゴは未実装、`public/favicon.svg` は最小プレースホルダー(根モチーフ実装は別 PR)

## 帰結

### 良い帰結

- 立ち上げ PR のレビュー範囲がスタック・運用方針・ブランドミラーに絞られる
- 姉妹サイトと共通の hooks(`branch-guard.sh` / `pre-compact.sh` / `post-compact.sh`)・ADR テンプレート・`context-management.md` をそのまま使える
- 6 法令本文の引用ルール(政府標準利用規約 + edu-watch ADR 0008 5 要件継承)を別 PR で慎重に確定でき、コンテンツ書き出しと並走しない
- 5 サイト体系の `BRAND.md` の差分が発生したら明示的に同期 PR を立てる運用が見える化される

### トレードオフ / 既知のリスク

- edu-evidence で実装済みの便利機能(用語ツールチップ・全文検索・OG 画像生成)を都度移植する必要がある(必要になった時点で個別 PR)
- BRAND.md ミラーの同期は手動。edu-evidence 側で更新したら edu-law / edu-research にコピーする運用負担が発生する
- ロゴ未実装の状態で初期 PR を出すため、本番デプロイ後の見た目は仮(プレースホルダー favicon のみ)

## 撤回 / 再検討の条件

- edu-evidence のコア機能(用語ツールチップ等)が法令解説でも自然に使えると判明した場合、機能移植 ADR を起こす
- BRAND.md の差分が 3 リポジトリで頻繁にズレる場合、共有 npm パッケージ化(`@edu-evidence/brand`)に切り替える(BRAND.md にも検討記述あり)
- 政府標準利用規約の解釈で本サイトの公開可否に影響する事案が発生した場合、引用ルール ADR を上書きする
