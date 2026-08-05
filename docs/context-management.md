# Context Management

会話は消える。ファイルは残る。EduLaw JP で意思決定や進捗を保全するための運用方針。本ガイドは姉妹サイト EduEvidence JP / EduWatch JP と同一思想で、固有事情のみ本リポジトリ向けに調整している。

## 基本原則 — File is the memory

Claude Code とのセッションは context window の上限に達すると圧縮(コンパクション)される。圧縮時に失われやすいのは「議論の過程」「却下した選択肢の理由」「試行錯誤のログ」。これらをファイルに書き出しておけば、圧縮を跨いで保全できる。

| レイヤ | 役割 | 配置 |
|---|---|---|
| **`.claude/state/active.md`** | 現在のセッションのチェックポイント。マイルストーンごとに更新 | `.gitignore` で git 追跡しない(私的状態) |
| **`docs/decisions/<連番>-*.md`**(ADR) | 主要意思決定の不変記録 | git 追跡、Public |
| **`docs/sessions/<日付>.md`**(任意) | 1 セッションの議事録要約 | git 追跡しない場合は `.gitignore` |
| **メモリ**(`~/.claude/projects/.../memory/`) | 運営者の個人的な嗜好・私的方針 | Private、リポジトリ外 |
| **`CLAUDE.md` / `docs/BRAND.md`** | プロジェクトの恒久的な規約 | git 追跡、Public |

## レイヤ間の振り分け指針

- **「決まったこと」** → ADR(`docs/decisions/`)
- **「いま作業中の具体内容」** → `.claude/state/active.md`(逐次更新)
- **「変わらない規約・ルール」** → `CLAUDE.md` / `BRAND.md`
- **「運営者の個人的な嗜好」** → メモリ(リポジトリ外)
- **「公開しない議事録」** → `.gitignore` 配下(必要なら `docs/sessions/`)

迷ったときの判断:**「他のメンテナーが半年後に読んで意味があるか」=Yes なら ADR、No なら state / メモリ**。

## active.md の運用

`.claude/state/active.md` は **生きたチェックポイント**。以下のタイミングで更新する:

- 主要な意思決定が確定した時(ADR を起こすほどでもない小規模な合意も含む)
- PR を作成した / マージした時
- 別ブランチに切り替える時
- 同じ問題で 2 回以上試行錯誤した時(失敗ログとして)
- セッション終了時

### 共通テンプレート(全プロジェクト統一、2026-05-21 6 サブ節に拡張)

各セッションのエントリは「直近の状態(YYYY-MM-DD ...)」見出しの下に **下記 6 サブ節** を持つ。新しいエントリを既存のものより上に積む(時系列降順)。2026-05-21 に Anthropic Claude Code engineer Thariq Shihipar(@TRQ212)の implementation-notes プロンプト(逸脱・判断・トレードオフ・未解決を実装中にリアルタイム記録)を採用し、「実装ノート」サブ節を追加。

```markdown
## 直近の状態(YYYY-MM-DD セッション完了、PR #X〜 マージ済)

`main` 同期済、ローカル作業ブランチ全削除。本セッションで以下 N 件の PR をマージ。

### 本タスクで作成 / 変更

- **PR #X**: 内容を 1〜2 文で
- **PR #Y**: 内容を 1〜2 文で

### 検証

- `npm run build` / `npm run check` の実行結果
- 本番計測などの観測値

### 実装ノート(逸脱・判断・トレードオフ・未解決)

- Plan / 事前合意で握った仕様から実装中に変えた点
- 仕様に書かれていなかった判断(命名・閾値・スコープ縮小など)
- トレードオフ(複数選択肢があった場合、何を選んで何を捨てたか)
- 未解決の判断 / 次の AI または次セッションが確認すべき Open questions
- 逸脱が一切なかった場合は「逸脱なし」と明示(空欄禁止)

### 採択された規約 / 仕組み(本セッション内で確定)

- **memory rule N**: 規約名と要点
- **ADR NNNN**: docs / ADR 化したもの

### サイト稼働状況

- ページ数 / 公式解説リンクのカバー法令数
- Cloudflare Workers デプロイ状況など

### Next Action

- 短期(優先順)と中長期を 5〜10 件で列挙
```

### サブ節の使い分け

- **本タスクで作成 / 変更**: PR 単位で記述。複数プロジェクトを並走したセッションでは `#### Project 1` のように 4 段見出しで分割可。
- **検証**: 静的検証(build / check)+ 動的観測(本番 Lighthouse 等)を一覧。
- **実装ノート(逸脱・判断・トレードオフ・未解決)**: Plan Mode で合意した仕様と実装中の判断の乖離を埋めるサブ節。Design decisions / Deviations / Tradeoffs / Open questions の 4 カテゴリを意識する。ADR ほど重くない判断を主対象とし、ADR で残すべき重大決定はそちらに昇格させる。逸脱なしの場合も「逸脱なし」と明示(空欄禁止)。由来は Anthropic Claude Code engineer Thariq Shihipar(@TRQ212)の 2026-05-18 X 投稿。
- **採択された規約 / 仕組み**: memory rule、ADR、docs ガイドラインなど、後続セッションが参照する規約を明示する欄。なければ省略可。
- **サイト稼働状況**: ページ数・公式解説カバレッジ・Cloudflare Workers デプロイ状況などスナップショット。本欄は EduLaw JP では「6 法令のうち何法令の公式解説リンクが整備済か」を主指標とする。
- **Next Action**: 次セッションの起点。短期(優先順)/ 中長期 / 横断課題で分けてもよい。

### 過去エントリの扱い

- 直近 1〜2 セッション分は本ファイル内に時系列で残す
- 古いエントリは要点だけ残して圧縮するか、`docs/sessions/<date>.md` 側に移してリンクで参照
- どこまで残すかはマシンの記憶ではなく、**次セッションの再開時に必要な情報量** で判断

### サイズ管理とアーカイブ運用

active.md がセッション履歴で肥大化すると、セッション開始時の読み込みコストが増え Lost-in-Multi-Turn のリスクが上がる。下記の閾値とフローで定期的に整理する。

#### サイズの目安

| 行数 | 目安トークン | 影響 |
|---|---|---|
| 〜500 行 | 〜30k | 推奨ゾーン |
| 500〜1,500 行 | 30k〜90k | 体感影響なし |
| 1,500〜3,000 行 | 90k〜180k | 読み込み時間増、検索精度低下 |
| 3,000 行超 | 180k+ | Lost-in-Multi-Turn リスク域 |

#### 自動感知

`.claude/hooks/check-active-size.sh` が SessionStart hook として登録済(`.claude/settings.json`)。`wc -l` で行数を測り、**1,500 行**を超えるとセッション開始時に additionalContext へ警告を注入する。閾値を変えたい場合はスクリプト内 `THRESHOLD` を直接編集する。

#### アーカイブ手順

1. 切り出し位置を `grep -n '^# 直近の状態\|^## 直近の状態' .claude/state/active.md` で確認(本リポは 1 段見出しを使用)
2. 残すブロックの境界となる「次に古いセッション開始行」を `TRIM_LINE` とする(その行の **前** までを残す)
3. `mkdir -p .claude/state/archive` で archive ディレクトリ準備
4. archive 作成: `{ printf 'header...'; sed -n "${TRIM_LINE},$p" active.md; } > archive/<NAME>.md`
5. active 切り詰め: `{ sed -n "1,$((TRIM_LINE-1))p" active.md; printf '<!-- ヒント -->'; } > /tmp/t && mv /tmp/t active.md`
6. 検証: `wc -l .claude/state/active.md` で推奨ゾーン内を確認

#### 整理履歴

- **2026-05-14 初回整理**: 整理対象外(461 行で推奨ゾーン内)。SessionStart hook で 1,500 行警告を自動感知するよう運用同期。
- **2026-05-20 アーカイブ整理**: 3,734 行 → 92 行(直近 2 ブロック=セッション #55-#56 を残し、それ以前は `archive/pre-2026-05-20-session-54.md` へ移動)。

### 例外と運用の幅

- 6 サブ節すべてが毎回必須ではない。短いセッションでは「本タスクで作成 / 変更」+「実装ノート」+「Next Action」だけでもよい
- 「検証」だけが目的のセッション(数値計測のみ等)では「本タスクで作成 / 変更」を「観測した数値」に読み替えて使う

## ADR の運用

`docs/decisions/<連番>-<短いスラッグ>.md`(例: `0001-initial-stack-and-mirror-brand.md`)。

各 ADR は以下のテンプレに従う:

```markdown
# 0001. タイトル

- 状態: 採用 / 撤回 / 上書き(0042 で上書き、等)
- 日付: YYYY-MM-DD
- 関連 PR: #N, #M

## 背景

何が問題で、なぜ決定が必要だったか。

## 検討した選択肢

- A) ...
- B) ...
- C) ...

## 決定

採用した案と理由。

## 帰結

- 良い帰結
- トレードオフ / 既知のリスク

## 撤回 / 再検討の条件

何が起きたら見直すか。
```

ADR は **不変** が原則。決定が覆ったら新規 ADR を起こし、旧 ADR の「状態」を `撤回(####で上書き)` にする。

## 圧縮(compaction)対策

### 自発的に圧縮するタイミング

- context 使用率が 60〜70% に達した時(限界まで待たない)
- 関連の薄いタスクに切り替える時(`/clear` を使う)
- 「同じ修正を 2 回試して失敗した」直後(リセットして再挑戦)
- ファイルへの書き出し / コミット / PR 作成の直後(自然な区切り)

### 圧縮直前の準備

`.claude/hooks/pre-compact.sh` が自動的に以下を会話に dump する:

- `.claude/state/active.md` の内容(現在のセッション状態)
- git の uncommitted / staged / untracked ファイル一覧

これにより、圧縮後のサマリにも必ず active.md への参照とファイル変更状態が含まれる。

### 圧縮直後の復元

`.claude/hooks/post-compact.sh` が「active.md を読み直せ」というリマインダーを出す。圧縮後は最初に `.claude/state/active.md` を読むことで、ファイル化されている決定と進行状態を復元できる。

## サブエージェント運用との連携

サブエージェントは独立したコンテキストで走るため、メインセッションの context を圧迫しない。以下を使い分ける:

- **メインで読む**: 1〜2 ファイルだけが対象、結果をすぐ判断に使うとき
- **サブエージェントに投げる**: 複数ファイル横断、5k トークン以上のファイル走査、調査フェーズ

サブエージェント結果が長い場合は、要点のみを active.md に転記し、生の出力は破棄する。

## セッション境界での運用

### セッション開始時

1. `.claude/state/active.md` を読む(最優先、何もしていない時でも)
2. 直近の git log / git status を確認
3. 進行中の PR を `gh pr list` で確認
4. 必要なら関連 ADR(`docs/decisions/`)に目を通す

### セッション終了時

- active.md に「次回の起点」を 1〜2 行書く
- 主要な意思決定があれば ADR を起こす
- 必要に応じて `docs/sessions/<date>.md` を作って議事要約

## 参考

- 元になったパターン: [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) の `.claude/docs/context-management.md` の核思想
- 姉妹サイト EduEvidence JP / EduWatch JP の `docs/context-management.md` と運用テンプレートを共通化
