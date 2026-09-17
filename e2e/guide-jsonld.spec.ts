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

// @type が Organization のオブジェクトを、JSON-LD の入れ子(Article.publisher など)まで含めて集める
function collectOrganizations(
  value: unknown,
  found: Record<string, unknown>[] = []
) {
  if (Array.isArray(value)) {
    for (const v of value) collectOrganizations(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj["@type"] === "Organization") found.push(obj);
    for (const v of Object.values(obj)) collectOrganizations(v, found);
  }
  return found;
}

// Organization は Layout が全ページに載せる。姉妹サイトとの関係は書かない(ADR 0030)。
// 名前で禁止すると別の関係語が抜けるので、キー集合そのものを固定する。トップレベルの
// 1 本目だけ見ると、2 本目のブロックや Article.publisher に書いた関係が素通りするので(#252)、
// ブロックを全部・入れ子も含めて集める。ガイドは publisher を持つので、代表はガイドで見る
test("Organization の JSON-LD に姉妹サイトとの関係を書いていない", async ({
  page,
}) => {
  await page.goto(`/guides/${guideSlugs[0]}/`);
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) =>
      els.map((el) => JSON.parse(el.textContent ?? "null"))
    );
  const organizations = collectOrganizations(scripts);
  expect(organizations.length).toBeGreaterThan(0);
  const allowedKeys = ["@context", "@type", "logo", "name", "url"];
  for (const organization of organizations) {
    for (const key of Object.keys(organization)) {
      expect(allowedKeys, `Organization に許していないキー: ${key}`).toContain(
        key
      );
    }
  }
  const topLevel = scripts.filter((s) => s?.["@type"] === "Organization");
  expect(topLevel).toHaveLength(1);
  expect(Object.keys(topLevel[0]).sort()).toEqual(allowedKeys);
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
