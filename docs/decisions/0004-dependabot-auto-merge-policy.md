# 0004. Dependabot patch/minor 自動マージ運用と main ブランチ保護

- 状態: 採用
- 日付: 2026-05-14
- 関連 ADR: 0001(初期スタックとミラーブランド、本 ADR の対象 CI を確定するための前提)
- 関連 PR: #10(`dependabot-auto-merge.yml` + `build.yml` 導入、2026-05-13 マージ)/ TBD(本 ADR 起票 PR)
- 撤回 / 再検討トリガー: 本 ADR §「撤回 / 再検討の条件」参照

## 背景

EduLaw JP は 6 法令 + 公式解説リンク中心の静的ポータルで、Astro 6 + Tailwind 4 + TypeScript の最小構成。1 人開発、`.github/dependabot.yml` で毎週月曜 09:00 JST に Dependabot が patch / minor / major の PR を出す。

姉妹サイト 2 つ(edu-evidence / edu-watch)に対して、本リポジトリは:

- 開設が新しく ADR の蓄積が少ない(本 ADR 起票時で 0001-0003)
- 法令本文がまだ着手前で、依存変更でビルドが壊れても影響範囲が小さい(検証コストが軽い)
- 一方で **PR トリガー CI が無かった** ため required check に指定できる candidate がゼロだった

このため 2026-05-13 の PR #10 で `dependabot-auto-merge.yml` と同時に `build.yml`(Node 24 + `npm ci` + `npm run build`、job 名 `Build site`)を新規追加した。`Build site` は本 ADR の required check として機能する。

## 検討した選択肢

### A. PR トリガー CI を追加せず、required なしで auto-merge(却下)

`required_status_checks` を空配列にすれば auto-merge は動くが、ビルドが壊れる patch / minor が本番に直接届くリスクが残る。法令ページが TODO で空でも、ビルドが落ちると `law.edu-evidence.org` の更新が止まる。却下。

### B. `link-check.yml`(schedule のみ)を PR トリガー化して required(却下)

既存の `link-check.yml` は schedule cron 専用で、PR で公式解説 URL を網羅的に踏むと数分の実行時間がかかる。Dependabot PR ごとに毎回外部リンクチェックを走らせるのは外部サーバへの負荷観点で却下。

### C. 最小 `build.yml`(npm ci + npm run build)を新規追加して required(採用)

- 軽量(Astro ビルドのみ、数十秒)
- 依存更新で型エラー / Astro 構文崩壊 / Tailwind 4 のクラス変更等が起きれば検知できる
- 外部 HTTP リクエストを伴わないので外部負荷なし
- 法令本文が増えてもビルドだけは確実に通る必要があり、required としての意味が長期的に保たれる

## 決定

C を採用。

### 自動マージ機構

`.github/workflows/dependabot-auto-merge.yml`(2026-05-13 PR #10 で導入済)が `pull_request` で起動、`github.actor == 'dependabot[bot]'` の場合のみ `dependabot/fetch-metadata@v2` で update-type を取得、`semver-major` 以外で `gh pr merge --auto --squash --delete-branch` を発火。

### required CI

`.github/workflows/build.yml`(2026-05-13 PR #10 で導入済):

- on: `pull_request` + main への `push`
- Node 24、`npm ci` + `npm run build`
- job 名 `Build site`

### main ブランチ保護

`gh api PUT /repos/Hayato-Isagawa/edu-law/branches/main/protection` で以下を設定(2026-05-14 適用):

- `required_status_checks.contexts = ["Build site"]`
- `required_status_checks.strict = false`
- `required_pull_request_reviews = null`(1 人開発)
- `enforce_admins = false`(初期値、hotfix 経路を残す)
- `restrictions = null` / `allow_force_pushes = false` / `allow_deletions = false`

### 前提条件 3 点

1. `allow_auto_merge = true`(Settings > General、2026-05-13 PATCH 適用済)
2. main ブランチ保護で required CI が登録済(本 ADR で設定)
3. Settings > Actions > General の「Allow GitHub Actions to create and approve pull requests」が有効(2026-05-14 ユーザー確認済)

### major の扱い

major は `dependabot/fetch-metadata@v2` の `update-type` で `semver-major` と判定された場合 auto-merge を発火しない。本リポジトリは依存が少ない(Astro / Tailwind / TypeScript 中心)ため、現時点で長期 `ignore` を要する依存はない。将来的に必要が出た場合は `dependabot.yml` に追加する。

## 帰結

### 良い帰結

- 法令本文の編集に集中している期間に、依存更新の手動マージで作業が中断されなくなる
- `Build site` で patch / minor 更新の最小限の健全性が担保される(ビルドが通る = 型 / 構文レベルの破壊なし)
- 姉妹サイト(edu-evidence ADR 0022 / edu-watch ADR 0041)と同じ運用方針が揃い、3 リポジトリ横断で同一の判断ができる

### トレードオフ / 既知のリスク

- `Build site` はビルドが通るかだけを見ており、視覚回帰や a11y 退行は検知しない。本サイトは Playwright E2E 未導入のため、UI 回帰は法令本文ページ実装時に E2E を別途検討する
- ブランチ保護で main 直 push が不可になる。法令の `lastVerified` 更新だけの小さな変更でも PR 経由が必須となるが、stale 検知の自動化(ADR 0003 で予約済の `stale-check.yml`)で受け止める想定
- `enforce_admins = false` のため緊急時に管理者バイパス可能。これは hotfix 経路の意図的な確保

## 撤回 / 再検討の条件

- `Build site` のみでは検知できない退行(視覚回帰・a11y 退行)が patch / minor auto-merge で 2 件以上発生した場合、E2E を required に追加する ADR を起こす
- 法令本文の量が増え、ビルドが長時間化して PR フィードバックが遅くなった場合、required check の構成を再検討
- 編集体制が変わり 2 人以上の運用になった場合、`required_pull_request_reviews` 導入を再検討

## 参考

- `.github/workflows/dependabot-auto-merge.yml`(PR #10 で導入、2026-05-13 マージ)
- `.github/workflows/build.yml`(PR #10 で導入、`Build site` job)
- `.github/dependabot.yml`
- `~/.claude/templates/dependabot/`(本運用の標準形を雛形化)
- 姉妹サイト: edu-evidence ADR 0022、edu-watch ADR 0041(同じ運用方針を 3 リポジトリ横断で採用)
