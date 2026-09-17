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

// @type が Organization か、そのサブタイプ(NewsMediaOrganization 等)か。配列 ["Organization"]
// でも書けるので両方見る — 文字列一致だけだとサブタイプに書き換えた組織が素通りする(#255)
function isOrganizationType(type: unknown) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && t.endsWith("Organization"));
}

// @type が Organization(サブタイプ・配列含む)のオブジェクトを、JSON-LD の入れ子
// (Article.publisher など)まで含めて集める
function collectOrganizations(
  value: unknown,
  found: Record<string, unknown>[] = []
) {
  if (Array.isArray(value)) {
    for (const v of value) collectOrganizations(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (isOrganizationType(obj["@type"])) found.push(obj);
    for (const v of Object.values(obj)) collectOrganizations(v, found);
  }
  return found;
}

// JSON-LD に現れる全ノードの @type を集める(入れ子含む)
function collectTypes(value: unknown, found: unknown[] = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectTypes(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("@type" in obj) found.push(obj["@type"]);
    for (const v of Object.values(obj)) collectTypes(v, found);
  }
  return found;
}

const siteHost = "law.edu-evidence.org";
// サイトが JSON-LD に書く @type の全部。schema.org の Organization の下位クラスは 187 あり
// 名前が Organization で終わるのは 8 つだけ(Corporation / NGO / OnlineBusiness 等は終わらない)
// なので、Organization を拾う側の網では姉妹ノードを別の型で書く形が抜ける。閉じた集合で
// 見ることで、見ていない型は何であれ赤にする(#255)
const knownTypes = [
  "Article",
  "BreadcrumbList",
  "ListItem",
  "Organization",
  "Person",
  "WebSite",
];

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
  for (const type of collectTypes(scripts)) {
    expect(
      knownTypes,
      `JSON-LD に見ていない @type: ${JSON.stringify(type)}`
    ).toContain(type);
  }
  const organizations = collectOrganizations(scripts);
  expect(organizations.length).toBeGreaterThan(0);
  const allowedKeys = ["@context", "@type", "logo", "name", "url"];
  for (const organization of organizations) {
    for (const key of Object.keys(organization)) {
      expect(allowedKeys, `Organization に許していないキー: ${key}`).toContain(
        key
      );
    }
    // 許すキーだけで書いた姉妹組織のノードを publisher 以外のスロットに置く形は、キー検査を
    // 通る。値で見る — 集めた Organization はすべて自サイトを指す(#255)
    expect(
      new URL(String(organization.url)).host,
      `Organization の url が自サイトでない: ${organization.url}`
    ).toBe(siteHost);
  }
  const topLevel = scripts.filter((s) => isOrganizationType(s?.["@type"]));
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
