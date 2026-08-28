import { test, expect } from "@playwright/test";

import { targets as pages } from "./targets.mjs";

// 撮影対象は `vrt/targets.mjs` にある(spec と、required check から走るガードが
// 同じ配列を読むため)。撮影が静かに減る経路 — 対象を消す / ループを絞る /
// `grepInvert` で外す / projects を減らす / skip に差し替える / テンプレートを
// 足して対象に載せ忘れる — は `scripts/__tests__/vrt-targets.test.mjs` が
// `playwright test --list` の実出力と突き合わせて見ている。**この spec の中には
// 置けない** — VRT は required check ではなく、`vrt.yml` の paths に載る PR でしか
// 起動しないので、ここに置いたガードは VRT が走ったときしか働かない。

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
