/**
 * VRT の撮影対象。`vrt/pages.spec.ts` と `scripts/__tests__/vrt-targets.test.mjs` が
 * この 1 つの配列を共有する。
 *
 * **spec のソースを正規表現で読む形は採らない。** それだと引用符をシングルに変えた
 * だけで検査が落ち、逆にコメント行に `path: "…"` と書けば件数を水増しできる
 * (どちらも実測)。データとして持てば、読む側は書き方に依存しない。
 *
 * 更新履歴の描画は対象外にしている。体感の変わる PR ごとに最大 1 件増える
 * (規約は `CONTRIBUTING.md` の「changelog を同じ PR で更新する」)ので、撮ると
 * 内容の追加だけで必ず差分が出て、本当の崩れが埋もれる。edu-evidence が #428 で
 * 同じ問題を踏み、安定させる方法を 2 つ試してどちらも採らなかった(最古のエントリ
 * だけを撮る / 最下部のビューポートを撮る)。経緯は edu-evidence の
 * `vrt/pages.spec.ts` 冒頭にある。
 *
 * このリポは更新履歴が 2 か所に出るので、外し方も 2 つに分かれる:
 *
 *   - `/changelog` — この配列に入れない
 *   - トップの「最近の更新」— ページは撮るが、リストだけ撮影前に隠す
 *     (`changelogEntries.slice(0, 3)` を描画するので高さが変わる。実測で
 *     1 件の追加が home を 63px 縮めた = 押し出された旧エントリの方が
 *     本文が長かった)
 *
 * 隠すのはリストだけで、見出しと「更新履歴へ →」リンクは撮り続ける。
 *
 * @typedef {object} Target
 * @property {string} name テスト名。`vrt/__screenshots__/<project>/<name>.png` になる
 * @property {string} path 撮影する URL
 * @property {string} [hide] 撮影前に display:none にするセレクタ。一致 0 件ならテストを落とす
 *
 * @type {Target[]}
 */
export const targets = [
  {
    name: "home",
    path: "/",
    hide: 'section[aria-labelledby="updates-heading"] ul',
  },
  { name: "about", path: "/about" },
  { name: "search", path: "/search" },
  { name: "scenes", path: "/scenes" },
  { name: "laws-index", path: "/laws" },
  { name: "law-detail", path: "/laws/school-education-act" },
  { name: "guides-index", path: "/guides" },
  { name: "guide-childcare-work-balance", path: "/guides/childcare-work-balance" },
  { name: "guide-customer-harassment", path: "/guides/customer-harassment" },
  { name: "guide-disciplinary-disposition", path: "/guides/disciplinary-disposition" },
  { name: "guide-legal-hierarchy", path: "/guides/legal-hierarchy" },
  { name: "guide-non-regular-teachers", path: "/guides/non-regular-teachers" },
  { name: "guide-occupational-injury", path: "/guides/occupational-injury" },
  { name: "guide-occupational-safety-health", path: "/guides/occupational-safety-health" },
  { name: "guide-parent-response", path: "/guides/parent-response" },
  { name: "guide-school-accident", path: "/guides/school-accident" },
  { name: "guide-teacher-mental-health", path: "/guides/teacher-mental-health" },
  { name: "guide-work-style-reform", path: "/guides/work-style-reform" },
  { name: "not-found", path: "/404" },
];

/**
 * 撮影オプション。`vrt/pages.spec.ts` が全件に渡し、
 * `scripts/__tests__/vrt-targets.test.mjs` が値を固定する。
 *
 * **spec の引数に直接書くと、値を弱めたことが required check から見えない。**
 * `fullPage` を落とすとビューポート内(desktop 1280x800 / mobile 390x844)しか
 * 撮らなくなるが、テストは 76 件走り続けて全部緑のまま通る — `threshold` の
 * 既定 0.2 がガードを黙って殺していた #160 と同じ形。config の
 * `expect.toHaveScreenshot` には `fullPage` を置けない(Playwright が
 * 受け付けるのはメソッド側だけ。型定義で確認済み)ので、データとして持つ。
 *
 * **残る穴**: 呼び出し側の書き方は見ていない。渡すのをやめる / 渡したうえで
 * `{ ...shotOptions, threshold: 0.2 }` と上書きする(メソッド側の引数は config の
 * `expect.toHaveScreenshot` に優先する)/ widen した再エクスポートを挟む、の
 * いずれも素通りする。固定できるのは値であって、呼び出し側の書き方ではない
 * (`hide` と同じ)。
 *
 * @type {{ fullPage: boolean }}
 */
export const shotOptions = { fullPage: true };
