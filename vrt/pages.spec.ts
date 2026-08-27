import { test, expect } from "@playwright/test";

interface Target {
  name: string;
  path: string;
  /** 撮影前に display:none にするセレクタ。一致 0 件ならテストを落とす */
  hide?: string;
}

/**
 * 更新履歴の描画は VRT の対象外にしている。
 *
 * 更新履歴は PR ごとに 1 件増える(rule 8)。撮ると内容の追加だけで必ず差分が
 * 出て、本当の崩れが埋もれる。edu-evidence が #428 で同じ問題を踏み、安定させる
 * 方法を 2 つ試してどちらも採らなかった(最古のエントリだけを撮る / 最下部の
 * ビューポートを撮る)。経緯は edu-evidence の `vrt/pages.spec.ts` 冒頭にある。
 *
 * このリポは更新履歴が 2 か所に出るので、外し方も 2 つに分かれる:
 *
 *   - `/changelog` — 対象リストに入れない
 *   - トップの「最近の更新」— ページは撮るが、リストだけ撮影前に隠す
 *     (`changelogEntries.slice(0, 3)` を描画するので高さが変わる。実測で
 *     1 件の追加が home を 63px 縮めた = 押し出された旧エントリの方が
 *     本文が長かった)
 *
 * 隠すのはリストだけで、見出しと「更新履歴へ →」リンクは撮り続ける。
 */
const pages: Target[] = [
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

// 代表 URL は手で並べているので、行を消すと撮影がその分だけ静かに減る。全消失は
// Playwright が "No tests found" で止めるが、19 を 10 に減らしても 20 件が緑で
// 終わるだけで気づけない。
//
// 下限(>=)ではなく件数を固定しているのは、**増やしたときにも赤にするため**。
// このリポは CLAUDE.md に代表 URL 数と撮影件数を書いており、実際に 2 世代ぶん
// (`/search` の追加と `/changelog` の除外)古いまま残っていた。代表 URL を足したら
// ここと CLAUDE.md の両方を直すことになる。
test("代表 URL の数が変わっていない", () => {
  expect(pages).toHaveLength(19);
});

for (const p of pages) {
  test(p.name, async ({ page }) => {
    await page.goto(p.path, { waitUntil: "networkidle" });
    if (p.hide) {
      // マークアップが変わってセレクタが外れたとき、隠せていないまま撮り続ける
      // のではなくここで落とす
      await expect(page.locator(p.hide)).toHaveCount(1);
      await page.addStyleTag({ content: `${p.hide} { display: none }` });
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${p.name}.png`, { fullPage: true });
  });
}
