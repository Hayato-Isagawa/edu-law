import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * 全ページの axe アクセシビリティ検査。
 *
 * ページ一覧はビルド済み dist/ から動的に列挙する。姉妹リポ(edu-evidence /
 * edu-watch)は代表 8 / 5 ページのハードコードだが、このリポは法令とガイドが
 * 増えていく前提なので、追加したページが黙って検査対象から漏れる方式は採らない。
 * 現在 31 ページで、全部回しても 1 分程度で終わる。
 *
 * ライト / ダークの双方を検査する。ダークだけで落ちる配色(dark 変種の付け忘れ)を
 * 取り逃がさないため。edu-evidence では実際にコントラスト違反 24 件がダーク側
 * だけで出ている。
 *
 * 既知違反の allowlist は置いていない。姉妹 2 リポは持っているが中身は空で、
 * 実際に許容しているものが無い。空の allowlist は「後で足せる穴」でしかないので、
 * 許容が必要になった時点で理由とともに作る。
 */

function listRoutes(dir: string, base = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return listRoutes(path.join(dir, entry.name), `${base}/${entry.name}`);
    }
    if (entry.name === "index.html") return [`${base}/`];
    if (entry.name === "404.html") return ["/404.html"];
    return [];
  });
}

const dist = path.resolve(process.cwd(), "dist");
const routes = listRoutes(dist).sort();

// 0 件のまま緑で終わると「検査した」と読めてしまう。ここで気づけるようにする。
test("dist からページを列挙できている", () => {
  expect(routes.length).toBeGreaterThan(20);
});

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const themes = ["light", "dark"] as const;

test.describe("a11y: axe-core 自動監査", () => {
  for (const theme of themes) {
    for (const route of routes) {
      test(`[${theme}] ${route} — critical/serious の違反がない`, async ({
        page,
      }) => {
        // Layout.astro の inline script より先に走らせる。後から切り替えると
        // 切り替え前の配色で axe が走る余地が残る。
        await page.addInitScript((t) => {
          localStorage.setItem("theme", t);
        }, theme);

        await page.goto(route);

        // 固定できていないまま検査し続けるのを防ぐ。inline script が動かなく
        // なったりキーが変わったりしたときに、ここで落ちる。
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const results = await new AxeBuilder({ page })
          .withTags(wcagTags)
          .analyze();

        const blocking = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );

        expect(
          blocking.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target.join(" ")),
          }))
        ).toEqual([]);
      });
    }
  }
});
