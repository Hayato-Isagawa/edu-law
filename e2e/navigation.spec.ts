import { test, expect } from "@playwright/test";
import { changelogEntries } from "../src/data/changelog";

/**
 * サイトの主要導線が通っていることと、件数の表示が実態と合っていることを見る。
 *
 * 件数は「12 法令を対象にする」という約束そのものなので、見出しの数字と
 * 実際のリンク数がずれたら、それは表示崩れではなく記載の誤りになる。
 */

test.describe("主要導線", () => {
  test("トップから法令一覧・詳細まで辿れる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "一覧へ" }).first().click();
    await expect(page).toHaveURL(/\/laws\/$/);

    await page.getByRole("link", { name: /学校教育法/ }).first().click();
    await expect(page).toHaveURL(/\/laws\/school-education-act\/$/);
    await expect(page.locator("h1")).toContainText("学校教育法");
  });

  test("トップから場面一覧へ辿れる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /件の場面を見る/ }).click();
    await expect(page).toHaveURL(/\/scenes\/$/);
  });

  test("ガイド一覧から個別ガイドへ辿れる", async ({ page }) => {
    await page.goto("/guides/");
    const first = page.locator('a[href^="/guides/"][href$="/"]').first();
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("h1")).not.toBeEmpty();
  });
});

// 同じ法令へのリンクは 1 ページに複数出る(場面カードからも張られる)ので、
// 重複を潰した slug の数で数える。
async function distinctLawSlugs(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const slugs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/laws/"]'))
      .map((a) => a.getAttribute("href") ?? "")
      .map((h) => /^\/laws\/([^/#?]+)\/?$/.exec(h)?.[1])
      .filter((s): s is string => Boolean(s));
    return [...new Set(slugs)].length;
  });
}

async function declaredLawCount(page: import("@playwright/test").Page) {
  const heading = await page
    .getByRole("heading", { name: /対象の\s*\d+\s*法令/ })
    .innerText();
  return Number(heading.replace(/[^\d]/g, ""));
}

test.describe("件数表示が実態と一致する", () => {
  test("トップの「対象の N 法令」と法令の数が一致する", async ({ page }) => {
    await page.goto("/");
    expect(await distinctLawSlugs(page)).toBe(await declaredLawCount(page));
  });

  test("法令一覧の法令数がトップの宣言と一致する", async ({ page }) => {
    await page.goto("/");
    const declared = await declaredLawCount(page);

    await page.goto("/laws/");
    expect(await distinctLawSlugs(page)).toBe(declared);
  });
});

test.describe("404", () => {
  // 2026-08-05 に直した不具合の再発防止。存在しない URL でトップページが
  // そのまま出ていて、「見つからなかった」と分からない状態だった。
  test("存在しない URL では 404 ページが出る", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist/");
    expect(res?.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("404");
  });

  test("404 ページはトップページではない", async ({ page }) => {
    await page.goto("/this-page-does-not-exist/");
    await expect(
      page.getByRole("heading", { name: /対象の\s*\d+\s*法令/ })
    ).toHaveCount(0);
  });
});

test.describe("更新履歴", () => {
  test("最新エントリがトップと更新履歴の両方に出る", async ({ page }) => {
    const latest = changelogEntries[0];

    await page.goto("/changelog/");
    await expect(page.locator(`#d-${latest.date}`)).toBeVisible();

    // トップは最新 3 件を出す。データの先頭が出ていなければ、
    // 並び順か描画のどちらかが壊れている。
    await page.goto("/");
    await expect(page.getByText(latest.items[0].text)).toBeVisible();
  });
});
