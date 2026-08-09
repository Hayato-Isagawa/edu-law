import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * このサイトが提供しているものは「法令本文への e-Gov リンク + 公式解説への
 * 誘導」そのもので、自前の法解釈ではない(CLAUDE.md「設計の核」)。
 * つまり**外部リンクが正しいことが機能要件**であって、付随的な品質ではない。
 *
 * リンク先の生死は週次の link-check(lychee)が見る。ここで見るのは
 * 「そもそも置かれているか」「開き方が安全か」の 2 点。
 */

const distLaws = path.resolve(process.cwd(), "dist/laws");
const lawSlugs = fs
  .readdirSync(distLaws, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

test("法令ページを列挙できている", () => {
  expect(lawSlugs.length).toBeGreaterThanOrEqual(12);
});

test.describe("法令ページから e-Gov に辿れる", () => {
  for (const slug of lawSlugs) {
    test(`${slug} に e-Gov 法令検索へのリンクがある`, async ({ page }) => {
      await page.goto(`/laws/${slug}/`);
      const egov = page.locator('a[href^="https://laws.e-gov.go.jp/"]');
      expect(await egov.count()).toBeGreaterThan(0);
    });
  }
});

test.describe("外部リンクの開き方", () => {
  // target="_blank" を付けた外部リンクに rel を付け忘れると、開いた先から
  // window.opener 経由で元タブを操作できる(tabnabbing)。
  //
  // 対象は target="_blank" のものだけ。同じタブで開くファミリー内リンク
  // (edu-evidence.org / news.edu-evidence.org)には opener が渡らないので
  // noopener を要求しない。
  for (const route of ["/", "/laws/school-education-act/", "/guides/parent-response/"]) {
    test(`${route} の別タブで開く外部リンクは rel に noopener を持つ`, async ({
      page,
    }) => {
      await page.goto(route);

      const links = await page.evaluate(() => {
        const here = location.host;
        const external = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href][target="_blank"]')
        ).filter((a) => {
          if (!/^https?:/.test(a.getAttribute("href") ?? "")) return false;
          return new URL(a.href).host !== here;
        });
        return {
          total: external.length,
          missing: external
            .filter((a) => !(a.rel || "").split(/\s+/).includes("noopener"))
            .map((a) => a.href),
        };
      });

      // 0 件のまま通ると「検査した」と読めてしまうので、対象があることも見る
      expect(links.total).toBeGreaterThan(0);
      expect(links.missing).toEqual([]);
    });
  }
});
