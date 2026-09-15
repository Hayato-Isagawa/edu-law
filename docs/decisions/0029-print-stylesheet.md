# 0029. 印刷スタイルを global.css の 1 ブロックで提供する(研修資料としての持ち出し)

- 状態: 採用
- 日付: 2026-09-15
- 関連 PR: #(本 ADR と同一 PR で確定)
- 関連 ADR: 0006(`data-theme`)、0008(sticky Header / multi-col Footer)、0023(VRT)

## 背景

法令ページとガイドは校内研修の配布資料として印刷される用途を想定しているが、印刷用のスタイルが
無く、sticky ヘッダー・ナビ・戻るボタン・ダーク配色がそのまま紙に出ていた。外部リンク(e-Gov・
公式解説)は紙では辿れない。姉妹サイト(edu-evidence / edu-watch)も同じ状態で、本 ADR の形を
各リポへ写す。

## 検討した選択肢

1. **`src/styles/global.css` 末尾の `@media print` ブロック 1 つ**(採用)。テンプレは触らない
2. テンプレに Tailwind の `print:` variant を散らす。差分がページごとに散り、新しいテンプレで付け忘れる
3. 印刷専用ページ・印刷ボタンの新設。ブラウザの印刷機能で足りる

## 決定

- **画面描画には一切影響させない。** `@media print` の外に書かない。VRT が 0 diff で通ることが
  「画面を変えていない」の実測になる
- **トークンの上書きは `:root` にだけ書く。** `[data-theme="dark"] { … }` のブロックを増やすと
  `src/pages/design-tokens.json.ts` がそれも dark 値として集約し、公開 `/design-tokens.json` の
  dark トークンが印刷値に化ける(実測)。`@theme` は `@layer theme` の中、`[data-theme="dark"]` と
  global.css の後続規則は unlayered なので、末尾の `:root` は同じ詳細度の後置として dark の上書きに
  勝つ(ビルド成果物で実測)
- **素の要素セレクタ(`a` 等)は書かない。** unlayered は Tailwind の全ユーティリティに勝つので、
  `a { color: inherit }` はトップの CTA(`text-white`)まで塗り替える。下線リンク(`.link-underline` /
  `.law-body a`)に限定する
- **外部リンク(`main a[target="_blank"]`)は `::after` で URL を併記する。** `inline-flex` のまま
  `overflow-wrap` も無いと、URL が flex item になって 320px 幅で横に溢れる(実測 scrollWidth 340)。
  印刷時は `display: inline` に戻し、`overflow-wrap: anywhere` も付ける(どちらか一方でも溢れは
  止まるが、題名が URL の横の細い列で折れるのは `inline` に戻さないと直らない)
- **サイトフッターは丸ごと消さない。** リンク集と姉妹サイト一覧・サイト説明は落とし、
  「コード MIT / 独自整理 CC BY-SA 4.0」・公共データ利用規約・連絡先・© は残す。配布物から
  帰属・ライセンス表示を落とさないため。ガイドの内側 footer は「本ページの根拠」だけで代わりに
  ならない。セレクタは `body > footer` と aria 属性で、ユーティリティ名に依存しない
- **ダークで印刷してもライトに戻す。** `--color-accent` と発行元バッジの色も light 値を再宣言する
  (`--color-bg` / `--color-ink` だけ戻すと、タン色のブランド表記とバッジが白紙に出る)
- **検査は `e2e/print.spec.ts`。** `colorScheme: "dark"` で `emulateMedia({ media: "print" })` し、
  chrome の非表示・配色・URL 併記・ライセンス行・320px の横溢れを見る

## 結果

- 印刷は A4 で法令ページ 2 ページ、ガイド(日本の法令階層)5 ページ(2026-09-15 時点、`page.pdf` で実測)
- `<details>` は src / dist とも 0 件なので開閉の処理は入れていない。使い始めたら足す
- 印刷ボタンは置かない。必要になったら別 ADR
