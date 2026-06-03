# サプライチェーン攻撃影響調査結果（2026-06-02〜03分）

調査実施日: 2026-06-03
調査対象プロジェクト: edu-law（`/Users/Hayato/edu-law`）
main commit: `6a64b6c364e92f141a5a21e438ad19e8a063cc09`（2026-05-28, "docs: add supply chain audit 2026-05-27 report (#72)"）
working tree: clean（tracked 変更 0 件）
remote: `https://github.com/Hayato-Isagawa/edu-law.git`
前回調査: `SUPPLY_CHAIN_AUDIT_2026-05-27.md`（TrapDoor / Megalodon / AI設定隠しUnicode、全 PASS）
実施範囲: A（npm Miasma）/ B（GitHub Actions 自己伝播）/ D（Chrome 149 ブラウザ）。C / E / F は手動・申し送り項目として記載。

## サマリー

- **影響なし（SAFE）**
- A: **PASS** — `@redhat-cloud-services` スコープ不在、既知悪性パッケージ 0、Miasma/C2 シグネチャ 0
- B: **PASS** — 攻撃ウィンドウ内の workflow 変更なし、Actions 実行履歴は既知ジョブのみ
- D: **該当なし** — Playwright / Puppeteer 不使用（バンドル Chromium なし）
- 検出事案番号: なし

## A. npm 依存（Miasma / @redhat-cloud-services）

### A-1. ロックファイル
- `package-lock.json`（lockfileVersion 3, 257,186 bytes）。pnpm/yarn/bun のロックファイルなし。

### A-2. @redhat-cloud-services スコープ依存
| 検査対象 | 結果 |
|---|---|
| package-lock.json grep（推移依存含む全列挙） | **0 件** |
| package.json grep（直接依存） | **0 件** |
| node_modules/@redhat-cloud-services ディレクトリ | **不在** |

判定: **該当なし**。Miasma の悪性 96 バージョンは全て `@redhat-cloud-services` スコープ内であり、当該スコープが依存ツリーに一切存在しないため、悪性バージョンの混入は論理的に発生し得ない。

### A-3. インストール済み痕跡
- node_modules ディレクトリ名に既知悪性パッケージ: **0 件**
- node_modules 内容の Miasma/C2 シグネチャ（`createCommitOnBranch` / `Spreading Blight` / `Shai-Hulud` / 既知C2）: **検出なし**

### A-4. ライフサイクルフック棚卸し
install 系フック総数: **2**。要精査（network / `node -e` / base64 / 外部URL取得）: **0 件**。

| パッケージ | フック | コマンド | 判定 |
|---|---|---|---|
| esbuild@0.27.7 | postinstall | `node install.js` | 正規（既知ビルドツール） |
| sharp@0.34.5 | install | `node install/check.js \|\| npm run build` | 正規（画像処理） |

## B. GitHub Actions（Miasma 自己伝播）

### B-1. ワークフロー変更
- workflow 4 本: `build.yml` / `dependabot-auto-merge.yml` / `link-check.yml` / `stale-check.yml`
- 2026-05-29 以降の `.github/workflows/` 変更コミット（author≠committer 偽装含む）: **なし**
- 不審パターン grep（`createCommitOnBranch` / `node -e` / `bun run` / `base64 -d` / `curl … | sh` / `webhook.site`）: **該当なし**

### B-2. composite action
- `action.yml` / `action.yaml`: **なし**

### B-3. Actions 実行履歴（2026-05-29〜2026-06-03, `gh run list`）
確認したランは全て既知ジョブに対応:
- Stale Check / Link Check（schedule）
- Dependabot auto-merge（astro-ecosystem グループ 3 updates）
- Dependabot Updates（github_actions / npm_and_yarn、dynamic）

不審な author・未知ワークフロー・予期しない OIDC トークン発行・想定外の publish: **確認されず**。

## C. 開発者端末インフォスティーラー対策（手動確認）

本リポからは検証不可。開発者各自が以下を確認すること:

```
□ 開発者端末で EDR / アンチマルウェアが稼働し最新定義か
□ GitHub / npm / クラウド認証情報をブラウザに平文保存していないか
□ GitHub セッションクッキー・PAT の有効期限と最終利用箇所を確認
□ GitHub の OAuth/連携アプリ一覧に身に覚えのない連携がないか
□ 自社ドメイン認証情報がインフォスティーラーログに出ていないか
□ 重要アカウントはセッション全失効 → 再ログイン → 2FA 再確認
```

## D. ブラウザ更新状況（Chrome 149）

- Playwright / Puppeteer: **不使用**（node_modules に未インストール、バンドル Chromium なし）

判定: **該当なし**。本リポに E2E 用バンドルブラウザは存在しない。ただし開発者端末・CI ランナー自体のブラウザ更新は共通で必要:

```
□ 開発者端末・CI ランナーの Chrome / Chromium / Edge を 149 系へ更新
  （Chrome 149, 22 Critical: CVE-2026-9872〜9893）
□ Electron / CEF 組み込みアプリ: 本リポでは不使用（該当なし）
```

## E. 即時対応リスト（認証情報ローテーション）

該当なし。A〜B の技術軸が全て PASS のため、隔離・永続化除去・ローテーションは不要。

## F. インフラ管理者への申し送り

```
□ 既知C2・偽装ドメインを DNS / プロキシ / FW でブロック（最新 IOC は Wiz / Snyk / Aikido / Socket / RHSB-2026-006 を参照）
  既知C2（継続ブロック推奨）:
  - 216.126.225.129（Megalodon C2）
  - flipboxstudio.info（Laravel-Lang C2）
  - ddjidd564.github.io（TrapDoor C2）
  - t.m-kosche.com（@antv / actions-cool C2）
□ GitHub Gists / webhook.site / GitHub Pages への業務外 egress を監視
□ CI ランナーからの想定外の Bun ランタイムダウンロードを検知
```
- Cloudflare Pages: 影響なし（リポ依存）
- 公開ドメイン law.edu-evidence.org: 影響なし

## 結論と次のアクション

**SAFE。** 2026-06-01 公開の Miasma および GitHub Actions 自己伝播に対し edu-law は影響なし。A / B 全 PASS。D は Playwright 不使用のため該当なし。

次のアクション:
1. （手動）C の開発者端末チェックリストを各自実施
2. （手動）端末・CI のブラウザ本体を Chrome 149 系へ更新
3. 継続注視: TrapDoor / Megalodon / Laravel-Lang / vpmdhaj タイポスクワット
