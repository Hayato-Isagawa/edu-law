# 貢献ガイド

EduLaw JP への貢献に関心を持っていただきありがとうございます。

## 貢献の方法

### Issue を立てる

- **公式解説リンクの誤り** — 文科省・文化庁・厚労省・e-Gov のリンク切れ・ページ移動を見つけた場合
- **追加すべき法令・通知** — スコープ内に加えるべき公式解説がある場合
- **改善提案** — UI・UX・アクセシビリティ等の改善案

### Pull Request を送る

1. Fork
2. ブランチ作成 (`git switch -c feat/my-change --no-track origin/main`)
3. コミット
4. Push して Pull Request

### changelog を同じ PR で更新する

読み手の行動や体験が変わる変更では、`src/data/changelog.ts`(RSS `src/pages/rss.xml.ts` の配信元でもある)を
同じ PR の中で更新する。後からまとめて埋めない。

- **載せる** — コンテンツの追加・変更 / ユーザー向け機能の追加・削除・移動 / 目に見える表示の変化 /
  利用体験に直接効く改善(初期表示の高速化・誤情報の訂正) / セキュリティ・データ取り扱いの通知
- **載せない** — 実装手段の変更 / 細かな視覚調整 / ADR・lint・リファクタなど整合性のための変更
- **1 PR = 最大 1 行**(大幅な機能追加を除く)。手段ではなく目的を書く。`a11y` / `CSP` /
  `hydration` のような開発者向けの語は使わない
- 上限は新規エントリにだけ適用する。既存エントリを遡って圧縮しない
- 同じ日付のエントリが既にあれば、日付を足さずにその `items` へ追記する。
  `rss.xml.ts` が 1 エントリ = 1 アイテムとして `link` を `/changelog/#d-{date}` で組み立てており、
  日付が重複するとリンク先が一意でなくなる(ADR 0017)。同じ日に複数書いても、
  `items[0]` がタイトルになり、全件が description に入る
- `type` は `add` / `update` / `fix` / `remove` の 4 種に限る。`perf` は新設せず、
  高速化は `update` にして文章で表す
- 対象ページが一意に特定できる項目には `links`(label + href)を付ける。サイト横断の変更は
  リンクなし、または一覧ページへのリンク。label は法令名 / ガイドの短名(ADR 0016 の表記)
- PR 本文に「changelog 反映: 不要」か「反映済」を 1 行入れる

1 エントリの文体と粒度は [ADR 0022](docs/decisions/0022-unify-changelog-register-and-granularity.md) が正本。

## 自前の法解釈は加えない

EduLaw JP は **公式解説への入口** を整理するサイトです。サイト側で独自の法解釈・現場助言・実務アドバイスは加えません。

- 「文科省はこう書いている」は OK
- 「したがって学校はこうすべき」は NG(→ それは公式解説本体の領域)
- 法令本文の引用は **公共データ利用規約 第 1.0 版** の範囲に限り、出典 URL・取得日を必ず明記

具体的な引用ルール・5 要件・誤り報告窓口は [ADR 0002 引用ルールと運用ポリシー](docs/decisions/0002-citation-rules-and-policy.md) を参照してください。

## コミットメッセージ / PR タイトル規約

[Conventional Commits](https://www.conventionalcommits.org/) 形式の **英語** で書く。

```
feat: add ijime-law landing page
fix: correct e-Gov link for school education law
docs: mirror BRAND.md from edu-evidence d206ea0
chore: bump astro from 6.2.1 to 6.2.2
```

使用する type:

| type | 用途 |
|---|---|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメント変更のみ |
| `chore` | ビルド・依存・設定等の雑務 |
| `ci` | CI/CD 設定変更 |
| `refactor` | 挙動を変えないコード整理 |
| `test` | テストの追加・修正 |
| `perf` | パフォーマンス改善 |

### 本文

**日本語で書く**。「なぜこの変更が必要か」「どう実装したか」「影響範囲」を詳しく説明してよい。

## ブランチ運用

`main` への直接編集・直接コミットは禁止。すべての変更はフィーチャーブランチを切ってから PR 経由で `main` に取り込む。

```bash
git switch -c <type>/<short-description> --no-track origin/main
# 例: feat/ijime-law-page, fix/e-gov-link, chore/deps-bump
```

`.claude/hooks/branch-guard.sh` が Claude Code 経由の `Edit` / `Write` / `MultiEdit` を `main` / `master` で拒否します。

## 開発環境

```bash
mise install
npm ci
npm run dev      # 開発サーバー
npm run build    # ビルド
npm run check    # Astro 型チェック
npm run check:sources # 公式解説の書名が正本と 5 つの写し先で一致しているか
```

公式解説の書名の正本は frontmatter の `officialExplanations[].title` です。同じ書名は
本文末尾の `## 出典` 節・frontmatter の `summary`・法令 md 本文・トップの
Highlights(`src/pages/index.astro`)・`src/data/*.ts` にも独立して写されており、
一部だけ直すと多くの場合 CI が赤くなります(掛からない例は後述)。

- **出典節**では『』や「」で引用された名前を全部照合します
- **それ以外**では `文部科学省『書名』` のように**発行元名を括弧の直前に隙間なく置いた引用だけ**を
  照合します(`「最近の更新」` のようなページ名・UI ラベルは対象外)。書名を書くときは
  発行元名をこの形で添えてください — `文部科学省は『…』` のように助詞を挟むと検査に入りません
- **Highlights** は各法令の `officialExplanations[0]` と完全一致であることを見ます。代表解説を
  変えたいときは、トップの配列ではなく `officialExplanations` の並び順を先に変えてください
- `officialExplanations` に載せない名前(本文限りの資料など)は `body-only:` マークで明示します。
  md 本文は `<!-- body-only: 書名 -->`、YAML は行末に `# body-only: 書名`、JS / TS と `.astro` の
  frontmatter は `// body-only: 書名` です。**マークはその引用と同じ範囲に置いてください**
  (法令 md は 出典節 / `summary` 行 / 本文 が別々の範囲、`src/` 側はファイル単位)

正本 30 件のうち 25 件はどこかの写しに現れるので改名すれば赤になります。残り 5 件は本文のリンク
文言のように**発行元名を伴わない形でしか写されていない**ため検査に掛かりません。frontmatter を
直したら、同じ書名をリンク文言や説明文で使っていないか自分でも確認してください。

## 行動規範

教師向けの法情報を扱うため、正確性と建設的な対話を最優先します。誤った法情報は現場の判断を誤らせ得るため、引用元の確認・出典明記・自前解釈の回避を厳守します。
