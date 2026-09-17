# 0030. Organization JSON-LD に姉妹サイトの関係を書かない(edu-watch ADR 0071 ミラー)

- 状態: 採用(0008 の「`sameAs` に姉妹サイト URL 配列」を上書き)
- 日付: 2026-09-16
- 関連 PR: `fix/organization-sameas`
- 関連 ADR: 0008(Layout skeleton。`Organization` の `sameAs` に姉妹サイトを置いた元の決定)、edu-watch 0071(原本。digest の `updatedAt` も含む)

## 背景

ファミリー 3 サイトの `Organization` JSON-LD は、姉妹サイトとの関係を 3 通りに表現していた
(edu-watch #671)。edu-evidence は関係の表現なし、本サイトは `sameAs` に `https://edu-evidence.org`
と `https://news.edu-evidence.org`(ADR 0008)、edu-watch は `parentOrganization` = EduEvidence JP。

schema.org の `sameAs` は「item の identity を一義に示す参照 Web ページの URL。例: Wikipedia の
ページ、Wikidata の項目、公式サイト」(2026-09-16 に `https://schema.org/sameAs` を取得して照合)。
姉妹サイトは別の実体なので、この定義に当たらない。`subOrganization` は
「第 1 の組織が第 2 を包含する関係。例: 子会社」(`parentOrganization` はその逆)で、3 サイトの about ページが公言する
「それぞれが独立したサイトとして、1 本の木を形づくります」と食い違う。Google の Organization
構造化データの文書(同日取得)は、`sameAs` を「組織の追加情報がある他サイトのページ。例: SNS や
レビューサイトのプロフィール」と説明し、`parentOrganization` / `subOrganization` / `memberOf` の
いずれも列挙していない。

選択肢の比較と根拠の全文は edu-watch ADR 0071 にある。本 ADR はその決定のうち本サイトに
効く部分を写す。

## 決定

1. **`Organization` に他の組織との関係を書かない。** `sameAs` から姉妹サイトの URL を外す。
   本サイトには自組織の SNS アカウントが無いので、`sameAs` はプロパティごと外す
2. **e2e(`e2e/guide-jsonld.spec.ts`)が `Organization` のキー集合を固定する。** 関係プロパティを
   名前で禁止すると `department` / `member` / `brand` など別の関係語が抜けるので、許すキーの
   集合そのものを比べる
3. 姉妹サイトとの関係は about ページの本文と相互リンクが担う。構造化データでは表現しない

## 結果

- `Organization` は `@context` / `@type` / `name` / `url` / `logo` だけになる。`WebSite` /
  `BreadcrumbList` / ガイドの `Article` は変わらない
- ADR 0008 の決定 5「`Organization`(`sameAs` に姉妹サイト URL 配列)」は本 ADR で上書きされる。
  同 ADR の他の項目(sticky Header / mobile menu / Footer / RSS / `escapeLd`)はそのまま
- どの表現が検索や AI アシスタントに効くかは未検証。本 ADR は「誤った主張を出さない」ことだけを
  根拠にしている

## 撤回 / 再検討の条件

- edu-watch ADR 0071 の再検討条件と同じ: schema.org が姉妹サイト(対等な関連組織)を表す
  プロパティを持つようになった場合、または Google / 主要な AI アシスタントの文書が組織間の
  関係プロパティを消費対象として列挙した場合、関係を書く選択肢を再検討する
- 本サイトが自組織の SNS アカウントを持った場合、`sameAs` をその URL で復活させる(姉妹サイトは
  引き続き置かない)

## 更新

- 2026-09-17(#252): 決定 2 の e2e は、トップレベルの `Organization` ブロック 1 本目だけでなく、全ブロックと入れ子(`Article.publisher`)の `Organization` を走査する。入れ子には許すキーの部分集合を、トップレベルには集合の一致を要求する(edu-watch #686 と同型)
- 2026-09-17(#255): `@type` はサブタイプ(`NewsMediaOrganization` 等)と配列 `["Organization"]` も `Organization` として拾い、集めた全 `Organization` の `url` のホストが自サイトであることを見る(許すキーだけで書いた姉妹組織のノードを別スロットに置く形を止める。edu-watch #691 と同型)
