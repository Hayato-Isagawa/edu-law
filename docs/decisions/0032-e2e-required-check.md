# 0032. Playwright E2E を main の required check に加える

- 状態: 採用(ADR 0004「撤回 / 再検討の条件」の 1 項目目を、件数の到達を待たずに適用する)
- 日付: 2026-10-19
- 関連 PR: `docs/e2e-required-check`
- 関連 ADR: 0004(Dependabot 自動マージと main ブランチ保護)・0023(VRT は required にしない)

## 背景

ADR 0004 は required check を「Build site」1 本とし、「`Build site` のみでは検知できない退行(視覚回帰・a11y 退行)が patch / minor auto-merge で 2 件以上発生した場合、E2E を required に追加する ADR を起こす」と定めた。当時は E2E が無かった。

2026-10-19、`@axe-core/playwright` 4.13.0 → 4.14.0 の Dependabot PR(#331)が、E2E の赤のまま auto-merge された。axe-core 4.14.0 が `label-content-name-mismatch` を既定で有効にし、トップの場面カードが serious として落ちていた。`gh pr merge --auto` は required しか待たないので、E2E の結果はマージに効かない。

赤は main でも見えなかった。auto-merge は GITHUB_TOKEN で main に入るので、その push では E2E が起動しない。Dependabot PR には ci-summary の通知も付かない(`ci-summary.yml` の `if:` が `dependabot[bot]` を除外)。main の E2E が赤いことは、次に人がマージした #333 の push で初めて表に出た。違反の修正は #337。

サイト自体はこのとき退行していない。既存のマークアップが新しい検査に引っかかっただけなので、ADR 0004 の条件(退行 2 件)を文言どおりに数えれば 0 件になる。

## 判断

2 件を待たない。2 件という閾値は E2E が無い時点で書かれたもので、今回は「E2E が赤い依存更新が main に入る」経路そのものが実際に通った。検査が厳しくなっただけの今回と、実際の退行は同じ経路を通る。たとえば検索は、索引が引けなくなっても入力欄を描いたまま 0 件を返すだけで、それを見ているのは E2E の `search.spec.ts` だけになっている。

姉妹の edu-evidence と edu-watch は、すでに「Playwright E2E」を classic ブランチ保護の required にしている。

## 検討した選択肢

1. **現状維持(2 件目を待つ)** — 却下。2 件目も同じ経路で、気づかれないまま main に入る
2. **auto-merge ワークフローの側で E2E の結果を待つ** — 却下。required check と同じことを自前のポーリングで書き直すことになり、壊れても素通りする部品が 1 つ増える。人がマージする PR も守らない
3. **テスト用の依存(`@axe-core/playwright` / `@playwright/test`)を auto-merge から外す** — 却下。実行時の依存が E2E を壊す経路を塞がない
4. **「Playwright E2E」を classic ブランチ保護の required に加える** — 採用

## 決定

2026-10-19 に、`PATCH /repos/Hayato-Isagawa/edu-law/branches/main/protection/required_status_checks` でサブリソースだけを更新した。

```
strict: false
checks: [{ context: "Build site", app_id: 15368 }, { context: "Playwright E2E", app_id: 15368 }]
```

- `app_id` 15368 は GitHub Actions。両方の check-run がこの app から出ていることを実測してから指定した
- ほかの保護設定(`enforce_admins: false` ほか ADR 0004 の値)は変えていない。変更前後の保護設定全体を突き合わせて確認した
- ruleset(id 16029277)には `required_status_checks` を置かない。required の定義は classic 保護の 1 か所だけにする(edu-evidence ADR 0029 と同じ形)

## 帰結

### 良い帰結

- E2E が赤い Dependabot PR はマージされずに残る。main の E2E が赤いまま誰も気づかない経路が塞がる
- 人がマージする PR も、E2E が赤ければマージできない
- 法令サイトを含むファミリー 3 サイトが、いずれも Playwright E2E を required に持つ形になる

### コスト

- マージできるまでの律速が Build site(2026-09-28 時点で 49 秒)から E2E に移る。2026-09-18〜10-19 の直近 100 run のうち、成功した 92 件の所要(run の作成から最終更新まで)は中央値 121 秒、90 パーセンタイル 324 秒、最大 653 秒
- Playwright / apt のインストールが遅れると、その間はすべての PR がマージできない。`e2e.yml` のコメントに、ファミリー横断で 28 分を超えた実例がある。`enforce_admins: false` なので管理者はバイパスできる(ADR 0004 の hotfix 経路)
- E2E が赤い Dependabot PR は、誰かが直すまで open のまま残る。ci-summary は Dependabot PR を通知しないので、放置されうる
- flaky による失敗は、2026-08-08〜10-19 の 251 run で 0 件。この期間の失敗 5 件は、すべて 10-19 の axe 4.14 由来

## 撤回 / 再検討の条件

- E2E の flaky で、人の PR が止まる事例が出た場合(リトライを入れるか、required から外すかを検討)
- E2E の所要が常態的に 10 分を超えた場合
- E2E が赤いまま放置された Dependabot PR が溜まった場合(通知の経路を検討)
