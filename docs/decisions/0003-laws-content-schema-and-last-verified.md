# 0003. 法令コンテンツコレクションのスキーマと lastVerified 必須化

- 状態: 採用
- 日付: 2026-05-12
- 関連 PR: TBD(`feat/laws-content-schema`)

## 背景

ADR 0001 で「自前の法解釈はしない、公式解説への入口を整理する」、ADR 0002 で「引用ルール 5 要件 + 政府標準利用規約 第 2.0 版の運用 + `lastVerified` 必須化と stale 検知 90 日 threshold」を採択している。本 ADR はその約束を `src/content.config.ts` の Zod スキーマで技術的に担保する。

整理が必要な論点は以下のとおり:

1. **公式解説の複数性** — 一つの法令に対し文部科学省・文化庁・厚生労働省・e-Gov・通知が並走する。姉妹サイト EduEvidence JP のスキーマ(`sourceUrl: z.string().url().optional()` の単一値)では受けきれない。
2. **取得日の運用** — ADR 0002 §lastVerified 運用予約は「6 法令ページ実装時に必須化」を約束している。EduEvidence JP の `lastVerified: z.string().optional()` は「未検証」と「公開日 = 最終検証日」が区別できず、stale 検知の起点として弱い。
3. **直リンク要件の技術担保** — ADR 0002 §2「公式 URL への直リンク」(e-Gov 本文 + `.go.jp` ドメインの公式解説のみ)は運用ルールだけでは緩み、第三者まとめサイトの URL がレビュー時に紛れ込む余地が残る。
4. **publisher の値域** — 第 1 期は文科省・文化庁・厚労省 + e-Gov の 4 主体だが、第 2 期で内閣府・こども家庭庁・都道府県教育委員会通知への拡張が見込まれる。`z.enum()` で固定すると拡張時に破壊変更となる。
5. **`retrievedAt` の粒度** — 公式解説ごとに取得日を必須化すると編集者負荷が増える。法令ページ全体の `lastVerified` を継承できれば、編集者は法令単位で取得日を更新するだけで済む。

## 検討した選択肢

- **A) 単一 URL(EduEvidence JP のスキーマ踏襲)** — `sourceUrl: z.string().url().optional()` + `lastVerified: z.string().optional()`。複数公式解説を持てず、stale 検知の起点も弱い。却下。
- **B) 配列 + `lastVerified` optional(EduEvidence JP の中間案)** — 公式解説を配列化するが取得日は任意。「未検証」と「初回公開」が区別できず、ADR 0002 §lastVerified 運用予約を満たせない。却下。
- **C) 配列 + `lastVerified` 必須 + ドメイン正規表現**(採用)— 公式解説を配列化し、取得日を必須化、`eGovUrl` と `officialExplanations[].url` をそれぞれ `laws.e-gov.go.jp/` 配下と `.go.jp/` 配下に正規表現で限定する。

補助議論:

- **`publisher` を enum vs string** — string + 中央リスト管理(`src/data/publishers.ts`)を採用。値域は別ファイルで管理し、新規 publisher は中央リスト更新だけで追加できるようにする。スキーマ側は `z.string().min(1)` で空文字のみ弾く。
- **`retrievedAt` を各 explanation で必須 vs optional + collection 継承** — optional + 継承を採用。各公式解説の `retrievedAt` 未指定時は、法令ページ全体の `lastVerified` を取得日として継承する(本 ADR で明記し、UI 実装時に踏襲する)。

## 決定

C 案を採用する。

### `src/content.config.ts`(新規)

```typescript
import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const laws = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/laws" }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().min(1).max(6),
    summary: z.string(),
    eGovUrl: z
      .string()
      .url()
      .regex(/^https:\/\/laws\.e-gov\.go\.jp\//),
    officialExplanations: z
      .array(
        z.object({
          publisher: z.string().min(1),
          title: z.string(),
          url: z
            .string()
            .url()
            .regex(/^https:\/\/[^/]+\.go\.jp\//),
          publishedAt: z.string().optional(),
          retrievedAt: z.string().optional(),
          format: z.enum(["pdf", "html"]).optional(),
        }),
      )
      .min(1),
    lastVerified: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { laws };
```

### `src/data/publishers.ts`(新規、publisher 中央リスト)

```typescript
export const PUBLISHER_LABELS: Record<string, string> = {
  mext: "文部科学省",
  bunkacho: "文化庁",
  kouroushou: "厚生労働省",
  egov: "e-Gov 法令検索",
  cao: "内閣府",
  cfa: "こども家庭庁",
  other: "その他",
};
```

UI 側は `PUBLISHER_LABELS[entry.data.officialExplanations[i].publisher] ?? entry.data.officialExplanations[i].publisher` の形で表示する(別 PR、UI 実装時)。

### 運用ルール

- `eGovUrl` は `https://laws.e-gov.go.jp/` 配下のみ許可する。e-Gov の旧ドメイン(`elaws.e-gov.go.jp` 等)が再開された場合は本 ADR を改訂して正規表現を拡張する。
- `officialExplanations[].url` は `.go.jp` 配下のみ許可する。SARTRAS など `.go.jp` 外の公式解説が必要になった場合は、本 ADR を改訂して許可ドメインを追加する(現状は SARTRAS は文化庁ページ経由で参照する想定)。
- `retrievedAt` 未指定の公式解説は、法令ページ全体の `lastVerified` を取得日として表示する(UI 実装時の規約)。
- `lastVerified` の stale 検知 threshold は 90 日(ADR 0002 §lastVerified 運用予約と一致)。`stale-check.yml`(別 PR)が `lastVerified` を読み、90 日以上経過した法令ページに対して自動で確認 issue を立てる。
- 雛形 entry `src/content/laws/school-education-act.md` は frontmatter のみで配置する。本文と URL の HTTP 到達性検証は本文 PR(`edu-pre-write-verifier` + WebSearch)で行う。

### スコープに含めないもの(本 PR の対象外)

- 6 法令の本文・残り 5 法令の雛形 entry(本文 PR で順次)
- 一覧ページ `/laws/` および詳細ページ `/laws/[slug]`(別 PR)
- `stale-check.yml`(別 PR、90 日 threshold で実装)
- 公式解説 URL の HTTP 到達性検証 CI(別 PR、`link-check.yml` の laws 配下対応)

## 帰結

### 良い帰結

- 出典欠如・取得日未記入・第三者まとめ URL の混入が `npm run build` で弾かれる。レビュー時に人間が見逃しても CI が止める。
- ADR 0001(自前解釈ゼロ)と ADR 0002(直リンク + lastVerified)が技術的に担保される。運用ルールだけに頼らない。
- `publisher` を string + 中央リスト管理にしたことで、第 2 期で都道府県教育委員会通知等を追加する際にスキーマ変更が不要になる。
- `retrievedAt` 継承により、法令単位で `lastVerified` を更新すれば公式解説の取得日もまとめて更新でき、編集者負荷が小さい。
- stale 検知の起点が確定し、`stale-check.yml`(別 PR)の実装が確定的に進められる。

### トレードオフ / 既知のリスク

- 姉妹サイト EduEvidence JP の `content.config.ts` とスキーマが分岐する。共通化の余地は将来的にあるが、現時点では EduEvidence JP 側の `sourceUrl` 単一値設計が法令解説には合わない。
- 雛形 entry `school-education-act.md` の URL は frontmatter PR の時点で WebSearch / 到達性検証を経ていない。本文 PR で再検証する旨を PR 本文で明示する。
- `.go.jp` ドメイン規制により、文化庁経由ではなく直接 SARTRAS 等 `.go.jp` 外の公式解説を扱うケースが生じた際は ADR 改訂が必要になる。

## 撤回 / 再検討の条件

- 法令 entry が 30 件を超える / 複数言語化が発生する / 外部研究者の協力が始まる / 都道府県教育委員会通知の取り込みが発生した場合、本 ADR を再レビューしてスキーマを見直す。
- EduEvidence JP 側で複数公式解説を持つ戦略が現れた場合、両サイトでスキーマ共通化を検討する。
- e-Gov・文部科学省・文化庁・厚生労働省のいずれかが公式解説のドメインを変更した場合、`eGovUrl` または `officialExplanations[].url` の正規表現を改訂する ADR を起こす。
- 政府標準利用規約が 2.1 / 3.0 等に改訂された場合、ADR 0002 と合わせて見直す。
