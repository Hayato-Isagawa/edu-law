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

// @type が Organization か、Organization で終わるサブタイプか。配列 ["Organization"] も見る。
// 見ていない @type は下の knownTypes が先に赤にするので、ここは防御の二重化(#255)
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

// 型ごとに許すキーの集合(dist の全 HTML を走査して決めた)。値がオブジェクトのノードは全部
// @type を持ち、この表のどれかに当たる。集合の外のキー(isPartOf / affiliation /
// sourceOrganization 等の関係語)は何であれ赤にし、@type の無いノード・@id だけの参照も
// 赤にする(edu-watch #700 と同型)
const nodeShapes: Record<string, string[]> = {
  Article: [
    "@context",
    "@type",
    "author",
    "description",
    "headline",
    "inLanguage",
    "mainEntityOfPage",
    "publisher",
    "url",
  ],
  BreadcrumbList: ["@context", "@type", "itemListElement"],
  ListItem: ["@type", "item", "name", "position"],
  Organization: ["@context", "@type", "logo", "name", "url"],
  Person: ["@type", "name", "sameAs", "url"],
  WebSite: ["@context", "@type", "description", "inLanguage", "name", "url"],
};

// JSON-LD の全ノードを形で検査する。URL 値(sameAs と @context 以外)は自サイトを指すこと —
// 姉妹サイトを WebSite ノードや文字列値で書く形を止める
function checkNodeShapes(value: unknown, where = "$") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkNodeShapes(v, `${where}[${i}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const type = obj["@type"];
  expect(typeof type, `${where}: @type の無いノード`).toBe("string");
  const shape = nodeShapes[type as string];
  expect(
    shape,
    `${where}: 形を決めていない @type ${JSON.stringify(type)}`
  ).toBeTruthy();
  for (const [key, v] of Object.entries(obj)) {
    expect(shape, `${where}.${key}: ${type} に許していないキー`).toContain(key);
    if (key === "@context") {
      // @context をオブジェクトにすると型名やキーを別名化できる(#259)。文字列 1 形に固定し、
      // トップレベルのブロックにしか置かない
      expect(v, `${where}.@context`).toBe("https://schema.org");
      expect(where, "@context は入れ子のノードに置かない").toMatch(
        /^\$\[\d+\]$/
      );
      continue;
    }
    if (key === "sameAs") {
      // sameAs は http(s) の URL 文字列の配列。Person(著者)のファミリードメインは許す — 同一人物の
      // ページなので定義どおり(edu-watch ADR 0071)
      expect(Array.isArray(v), `${where}.sameAs は配列`).toBe(true);
      for (const u of v as unknown[]) {
        expect(typeof u, `${where}.sameAs の要素は文字列`).toBe("string");
        // mailto: / javascript: / data: も URL.canParse は通すので、スキームを http(s) に限る(#263)
        expect(
          /^https?:\/\//i.test((u as string).trim()) &&
            URL.canParse((u as string).trim()),
          `${where}.sameAs が http(s) の URL でない: ${u}`
        ).toBe(true);
      }
      continue;
    }
    if (Array.isArray(v)) {
      // サイトが文字列の配列で書くのは sameAs だけ。url / logo を配列にすると要素のホストを
      // 見ないまま通るので、他のキーの配列はオブジェクトの並び(itemListElement など。再帰で
      // 形を見る)に限る(#263)
      for (const [i, item] of v.entries()) {
        expect(
          item !== null && typeof item === "object" && !Array.isArray(item),
          `${where}.${key}[${i}]: sameAs 以外の配列はオブジェクトの並びに限る`
        ).toBe(true);
      }
    }
    if (typeof v === "string") {
      // 前方一致 /^https?:\/\// だと `//host` や大文字スキーム・先頭空白が抜ける(#259)。
      // `https:host` / `https:/host` / `https:\\host` も WHATWG はホストに解釈するので、
      // http(s) スキームか `//` で始まれば URL として構文解析して見る(#263)
      const trimmed = v.trim();
      if (/^(?:https?:|\/\/)/i.test(trimmed)) {
        const candidate = trimmed.startsWith("//")
          ? `https:${trimmed}`
          : trimmed;
        expect(
          URL.canParse(candidate),
          `${where}.${key} が URL として読めない: ${v}`
        ).toBe(true);
        expect(
          new URL(candidate).host,
          `${where}.${key} が自サイトを指していない: ${v}`
        ).toBe(siteHost);
      }
    }
    checkNodeShapes(v, `${where}.${key}`);
  }
}

const distLaws = path.resolve(process.cwd(), "dist/laws");
const firstLawSlug = fs
  .readdirSync(distLaws, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()[0];

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
  checkNodeShapes(scripts);
  // トップレベルの WebSite は Layout の 1 本だけ(姉妹サイトを WebSite で足す形を止める)
  expect(scripts.filter((s) => s?.["@type"] === "WebSite")).toHaveLength(1);
  const organizations = collectOrganizations(scripts);
  expect(organizations.length).toBeGreaterThan(0);
  const allowedKeys = nodeShapes.Organization;
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

// 法令詳細はガイドと別テンプレート(Article / Person を持たず、ListItem.item が法令 URL を指す)なので、
// 形の検査はそちらでも 1 ページ見る(BreadcrumbList はガイドにもある)
test("法令詳細の JSON-LD も形と URL のホストが固定どおり", async ({ page }) => {
  expect(firstLawSlug, "dist/laws にページが無い").toBeTruthy();
  await page.goto(`/laws/${firstLawSlug}/`);
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) =>
      els.map((el) => JSON.parse(el.textContent ?? "null"))
    );
  expect(scripts.map((s) => s?.["@type"])).toContain("BreadcrumbList");
  checkNodeShapes(scripts);
  expect(scripts.filter((s) => s?.["@type"] === "WebSite")).toHaveLength(1);
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
