import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * ガイドページの Article JSON-LD(著者・発行者・URL)が全ページに載っていることを見る。
 * ガイドは 1 本ずつ手書きの .astro なので、1 ページで代表できない — dist を列挙して全件見る。
 */

const distGuides = path.resolve(process.cwd(), "dist/guides");
const guideSlugs = fs
  .readdirSync(distGuides, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

test("ガイドページを列挙できている", () => {
  expect(guideSlugs.length).toBeGreaterThanOrEqual(11);
});

// Organization は Layout が全ページに載せる。姉妹サイトとの関係は書かない(ADR 0030)。
// 名前で禁止すると別の関係語が抜けるので、キー集合そのものを固定する
test("Organization の JSON-LD に姉妹サイトとの関係を書いていない", async ({
  page,
}) => {
  await page.goto(`/guides/${guideSlugs[0]}/`);
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) =>
      els.map((el) => JSON.parse(el.textContent ?? "null"))
    );
  const organization = scripts.find((s) => s?.["@type"] === "Organization");
  expect(organization, "Organization の JSON-LD が無い").toBeTruthy();
  expect(Object.keys(organization).sort()).toEqual([
    "@context",
    "@type",
    "logo",
    "name",
    "url",
  ]);
});

test.describe("ガイドページの構造化データ", () => {
  for (const slug of guideSlugs) {
    test(`/guides/${slug}/ に Article の JSON-LD がある`, async ({ page }) => {
      await page.goto(`/guides/${slug}/`);
      const scripts = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((els) =>
          els.map((el) => JSON.parse(el.textContent ?? "null"))
        );
      const article = scripts.find((s) => s?.["@type"] === "Article");
      expect(article, "Article の JSON-LD が無い").toBeTruthy();
      // headline は <title> からサイト名を落としたもの(h1 は改行や短縮で別の文字列になりうる)
      const title = await page.title();
      expect(title).toMatch(/ — EduLaw JP$/);
      expect(article.headline).toBe(title.replace(/ — EduLaw JP$/, ""));
      expect(article.description.length).toBeGreaterThan(0);
      expect(article.author["@type"]).toBe("Person");
      expect(article.publisher.name).toBe("EduLaw JP");
      expect(new URL(article.url).pathname).toBe(`/guides/${slug}/`);
      expect(article.mainEntityOfPage).toBe(article.url);
    });
  }
});
