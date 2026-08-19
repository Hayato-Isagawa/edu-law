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
```

## 行動規範

教師向けの法情報を扱うため、正確性と建設的な対話を最優先します。誤った法情報は現場の判断を誤らせ得るため、引用元の確認・出典明記・自前解釈の回避を厳守します。
