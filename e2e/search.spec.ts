import { test, expect } from "@playwright/test";

/**
 * 検索が「置いてある」ではなく「引ける」ことを確かめる。
 *
 * 検索は pagefind で、`npm run build` の後段(`npx pagefind --site dist`)が
 * dist/pagefind/ を生成し、それをページ側の script が読む。インデックスの
 * 生成が飛んでも、UI 側は入力欄を描いたまま 0 件を返すだけなので、
 * 「ページが表示される」だけを見るテストでは壊れていることに気づけない。
 * 姉妹リポ(edu-evidence)の検索テストは実際そこまでしか見ていない。
 */

test.describe("検索", () => {
  test("検索 UI が pagefind に置き換わる", async ({ page }) => {
    await page.goto("/search/");
    await expect(page.locator("h1")).toContainText("検索");

    // pagefind-ui.js が読めないときはこのフォールバックが出る
    await expect(page.locator("#search-fallback")).toBeHidden();
    await expect(page.locator(".pagefind-ui__search-input")).toBeVisible();
  });

  test("法令名で引くと該当ページが結果に出る", async ({ page }) => {
    await page.goto("/search/");
    await page.locator(".pagefind-ui__search-input").fill("いじめ");

    await expect(page.locator(".pagefind-ui__result-link").first()).toBeVisible();

    // いじめ防止対策推進法のページが引けること。件数だけを見ると、
    // インデックスが別サイトの内容でも通ってしまう。
    // 1 ページにつき本文と見出しアンカーで複数の結果が出るので、
    // 件数は固定せず「1 件以上」で見る。
    const target = page.locator(
      '.pagefind-ui__result-link[href^="/laws/bullying-prevention-act/"]'
    );
    expect(await target.count()).toBeGreaterThan(0);
  });

  test("該当の無い語では 0 件になる", async ({ page }) => {
    await page.goto("/search/");

    // 和文の造語は使えない。pagefind は日本語を分割して部分一致させるので、
    // 「ぬりかべこんにゃくざむらい」でも 11 件返ってくる(実測)。
    // 索引に無いことが確実な ASCII 列で引く。
    await page.locator(".pagefind-ui__search-input").fill("zzqqxwv");

    await expect(page.locator(".pagefind-ui__message")).toContainText(
      "見つかりませんでした"
    );
    await expect(page.locator(".pagefind-ui__result-link")).toHaveCount(0);
  });
});
