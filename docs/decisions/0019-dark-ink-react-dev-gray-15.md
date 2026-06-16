# 0019. ダーク本文 ink を react.dev の gray-15(`#D0D3DC`)に統一する

- 状態: 採用
- 日付: 2026-06-16
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0006(ダークモード data-theme + システム追従。本 ADR はその `--color-ink`(dark) 値のみを上書きする)
- 姉妹サイト ADR: edu-evidence ADR 0015(本 ADR の起点)・edu-watch ADR 0030(同型ミラー)

## 背景

ADR 0006 でダークモードを導入した際、`--color-ink`(dark) を edu-evidence を参照して `#f0f6fc`(GitHub fg.default、純白寄り)に設定した。しかしこの値は **edu-evidence が ADR 0015 ですでに撤回していた値** であり、姉妹サイト間で本文色がドリフトしていた。

実測突合(2026-06-16):

| サイト | dark `--color-ink` | 根拠 |
|---|---|---|
| 本サイト(edu-law) | `#f0f6fc` | ADR 0006(本 ADR で是正) |
| edu-evidence | `#d0d3dc` | ADR 0015 |
| edu-watch | `#d0d3dc` | ADR 0030 |

ドリフトに至った時系列:

- edu-evidence ADR 0013(2026-05-03): ink を `#f0f6fc` にする方針を記載
- edu-evidence ADR 0015(2026-05-04、ADR 0013 と同 PR): preview の 3 段階フィードバック「白すぎて目にきつい」を経て `#f0f6fc → #d0d3dc`(react.dev gray-15、明度 85%)へ再微調整して確定。edu-watch も ADR 0030 で同時にミラー
- 本サイト ADR 0006(2026-05-19): ADR 0011 / 0013 は参照したが **ADR 0015 を見落とし**、撤回済みの `#f0f6fc` をそのまま採用していた

「純白がきつい」原因はフォント環境にある。react.dev は太め stem の独自フォント(Optimistic Text)前提なので純白寄り gray-5 でも目にやさしいが、本サイトは姉妹サイトと同じ system-font-stack(日本語は Hiragino Kaku Gothic ProN W3 の細字)で描画するため、純白寄りの ink が「白の細線」として目にきつくなる。**本サイトはダーク背景 `#16181d` もフォントスタックも edu-evidence と同一**であり、ADR 0015 の結論(react.dev の gray ランプ内で明度を 2 段下げる)がそのまま当てはまる。

姉妹サイト 3 つ(葉 / 双葉 / 根)で本文色が分かれると統合ブランドの印象が崩れる(memory rule 7)。本 ADR で `#d0d3dc` に統一し、ドリフトを是正する。

詳細な原因分析(フォント環境差)・3 段階の試行履歴・選択肢比較は [edu-evidence ADR 0015](https://github.com/Hayato-Isagawa/edu-evidence/blob/main/docs/decisions/0015-ink-token-react-dev-gray-15.md) を参照。

## 検討した選択肢

### A) 据え置き(`#f0f6fc` のまま)

- 利点: 変更なし
- 欠点: 姉妹サイトとの本文色ドリフトが残る。フォント環境(細字 Hiragino)で純白寄りが目にきついという、edu-evidence が 3 回のフィードバックで確認済みの問題を本サイトも抱えたままになる

### B) `#d0d3dc`(react.dev gray-15)に統一(採用)

- 利点: 姉妹サイトと本文色が一致(memory rule 7)。edu-evidence ADR 0015 のフォント環境分析が本サイトにそのまま適用でき、長文(法令本文 + 公式解説)の夜間閲覧の負荷が下がる。背景が同一値のためコントラストも検証済み(~11.6:1、AAA)
- 欠点: ADR 0006 のダーク本文色の決定を 1 値だけ覆すことになる(本 ADR で明示的に supersede)

## 決定

**選択肢 B** を採用。`--color-ink`(dark) を `#f0f6fc` から **`#d0d3dc`**(react.dev gray-15)に変更する。

```diff
 [data-theme="dark"] {
   --color-bg: #16181d;
-  --color-ink: #f0f6fc;
+  --color-ink: #d0d3dc;
   --color-sub: #9ba1a8;
   --color-line: #30363d;
   --color-card: #1f2328;
   --color-accent: #c89a7a;
 }
```

### コントラスト確認

- 本文 `#d0d3dc` × 背景 `#16181d`: 約 **11.6:1**(AAA。背景は edu-evidence ADR 0015 と同一値のため同じ比率)
- サブ文字 `#9ba1a8` × 背景: 約 7.5:1(AAA、本文との階層差 ~22pt を維持)
- アクセント(茶)`#c89a7a` × 背景: 約 7.2:1(AAA、変更なし。ADR 0006)

### 維持する設計

- その他の dark トークン(bg / sub / line / card / badge): 変更なし
- アクセント色(本サイト固有の茶 `#c89a7a`、ADR 0006): 維持。姉妹サイトとのアクセント差は各サイトのブランド色(葉=緑 / 双葉=紺 / 根=茶)による意図的な差分であり、本 ADR の対象外
- ライトテーマ: 完全維持
- 起動方式・`data-theme` 属性・トークンセマンティクス(ADR 0006): 維持

## ADR 0006 との関係

ADR は原則不変のため ADR 0006 本体は編集しない。本 ADR は ADR 0006 が定めた値のうち **`--color-ink`(dark) の 1 値のみ** を supersede する。ADR 0006 のその他の決定(起動方式、`data-theme` 属性、トークンセマンティクス、ライト値、アクセント `#c89a7a` 等)はすべて有効なまま。姉妹サイト edu-evidence でも ADR 0015 が ADR 0013 の ink 値のみを上書きし、ADR 0013 自体は「採用」のまま残す運用を採っている(同一前例)。

## アクセシビリティ

- WCAG SC 1.4.3 / 1.4.6: AAA を維持(~11.6:1)
- 中性グレーで色覚特性の影響を受けにくい
- AAA 過剰コントラストからの逆方向調整であり、長文(法令本文 + 公式解説)の夜間閲覧での疲労軽減に資する

## 観測

- preview デプロイで代表ページ(トップ / 法令詳細 = 長文)の本文色を OS dark 設定で目視
- 本文 `#d0d3dc` vs サブ文字 `#9ba1a8` の階層が崩れていないこと

## 撤回 / 再検討の条件

- 本文色を本サイト固有に分ける積極的な根拠(例: 茶アクセントとの干渉)が後日確認された場合、姉妹サイトとの差分を許容する新規 ADR を起こす
- 姉妹サイト edu-evidence / edu-watch が gray-15 から再調整した場合、memory rule 7 に従い本サイトも追従を検討する

## 関連参照

- edu-evidence ADR 0015(本 ADR の起点、フォント環境差の詳細分析)
- edu-watch ADR 0030(同型ミラー)
- 本サイト ADR 0006(ダークモード本体、本 ADR が ink 値のみ上書き)
- [reactjs/react.dev — colors.js](https://github.com/reactjs/react.dev/blob/main/colors.js) の `'gray-15': '#D0D3DC'`
- memory rule 7(姉妹サイト UI/UX 統一)
