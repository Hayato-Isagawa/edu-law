# Architecture Decision Records (ADR)

本ディレクトリは EduLaw JP の主要な意思決定の不変記録を集めたものです。なぜその決定に至ったか、どの選択肢が却下されたか、何が起きたら見直すかを時系列で残し、半年後・1 年後の自分や新しい貢献者が意思決定の背景を辿れるようにします。

## 運用方針

- 決定が確定したら新規 ADR を追加(連番 4 桁)
- **原則として改変しない**(誤植修正は例外)
- 決定を覆す場合は新規 ADR を起こし、旧 ADR の「状態」を `撤回(####で上書き)` に変える
- 対象: ブランド体系、技術選定、コンテンツポリシー、引用規約、運営方針

## 対象外

以下は ADR ではなく別の場所で管理します。

- コードの実装方針 → コードコメント / PR 本文
- セッション中の作業状態 → `.claude/state/active.md`
- 日々のページ編集判断 → 当該ファイルの git history
- 個人の作業嗜好 → メモリ(リポジトリ外)

## テンプレート

```markdown
# NNNN. タイトル

- 状態: 採用 / 撤回(####で上書き)
- 日付: YYYY-MM-DD
- 関連 PR: #N, #M

## 背景
## 検討した選択肢
## 決定
## 帰結
## 撤回 / 再検討の条件
```

詳細な運用方針は [`../context-management.md`](../context-management.md) を参照。

## 索引

- [0001. 初期スタックと BRAND.md ミラー方針の採択](0001-initial-stack-and-mirror-brand.md)
- [0002. 引用ルールと運用ポリシー](0002-citation-rules-and-policy.md)
- [0003. 法令コンテンツコレクションのスキーマと lastVerified 必須化](0003-laws-content-schema-and-last-verified.md)
- [0004. Dependabot patch/minor 自動マージ運用と main ブランチ保護](0004-dependabot-auto-merge-policy.md)
- [0005. 初期スコープの拡張(児童福祉法を 7 法令目として追加)](0005-expand-initial-scope-child-welfare-act.md)
- [0006. ダークモードはシステム追従デフォルト + 手動切替トグル(`data-theme` 属性)で提供する](0006-dark-mode-data-theme-with-system-default.md)
- [0007. トップページを法令の目次・台帳として設計する(カード型から行型 + 3px アクセントバーへの置換)](0007-top-page-as-law-index.md)
- [0008. Layout skeleton: sticky Header + mobile menu + multi-col Footer + RSS](0008-layout-skeleton-with-sticky-header-mobile-menu-multicol-footer-and-rss.md)
- [0009. Highlights セクションの選定基準と表示順](0009-highlights-selection-criteria.md) — 定常状態の件数は 0026 で 12 件に拡張(選定基準は有効)
- [0010. ガイド一覧の新設と「教師を守る」スコープの追加](0010-guides-index-and-teacher-protection-scope.md)
- [0011. 「子供への指導・対応」と「教師を守る」の 2 入口 IA(トップでの分岐)](0011-two-entrance-ia-child-guidance-and-teacher-protection.md) — 撤回(0018 で上書き)
- [0012. 引用根拠を公共データ利用規約 第1.0版 へ移行](0012-migrate-to-public-data-license.md)
- [0013. 「教師を守る」入口の独立ページ化](0013-protect-teachers-entrance-page.md) — 撤回(0018 で上書き)
- [0014. カード border-radius を rounded-xl に統一(姉妹サイト規約の継承)](0014-card-border-radius-rounded-xl.md)
- [0015. 「子供への指導・対応」入口の独立ページ化(2 入口の対称化)](0015-child-guidance-entrance-page.md) — 撤回(0018 で上書き)
- [0016. 「教師を守る」入口のガイドを性質別 3 グループに再編](0016-protect-teachers-guide-subgroups.md)
- [0017. 更新情報の正本を changelog データに一元化し、RSS・トップ新着を導出する](0017-changelog-as-update-source.md)
- [0018. 場面軸 IA への再編とグローバルナビへの場面レンズ追加](0018-scene-based-ia.md)
- [0019. ダーク本文 ink を react.dev の gray-15(`#D0D3DC`)に統一する](0019-dark-ink-react-dev-gray-15.md)
- [0020. 初期スコープの拡張(教育機会確保法を 12 法令目として追加)と不登校場面の新設](0020-expand-scope-education-opportunity-act-and-school-refusal-scene.md)
- [0021. 「学校の保健・安全」カテゴリの新設と学校保健安全法の場面化](0021-add-school-health-safety-category.md)
- [0022. changelog の文体(敬体)と粒度をファミリー統一する](0022-unify-changelog-register-and-granularity.md)
- [0023. ビジュアルリグレッションテスト(VRT)を視覚変更 PR に限定して導入する(edu-evidence ADR 0024 ミラー)](0023-visual-regression-testing.md)
- [0024. Cloudflare Web Analytics を手動スニペット方式で導入し CSP を最小限緩和する(edu-evidence ADR 0026 ミラー)](0024-web-analytics-beacon-and-csp.md)
- [0025. Astro 7 へ移行し XSS advisory 3 件を解消する(Markdown は `processor: unified()` で維持・edu-evidence ADR 0027 ミラー)](0025-astro-7-migration.md)
- [0026. Highlights を全 12 法令に拡張し、代表解説の起点を laws collection の並び順に一致させる](0026-highlights-cover-all-laws.md)
