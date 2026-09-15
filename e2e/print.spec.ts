import { test, expect } from "@playwright/test";

/**
 * 印刷(研修資料としての持ち出し)。global.css の @media print ブロックが効いていることを見る。
 * ダークで印刷した場合を見る — 配色の戻し忘れはライトでは検出できない。
 * 法令ページとガイドで代表する(構造が違う: 入口セクションの有無・内側 footer の中身)。
 */

const pages = ["/laws/school-education-act/", "/guides/legal-hierarchy/"];

test.describe("印刷スタイル", () => {
  test.use({ colorScheme: "dark" });

  for (const path of pages) {
    test(`${path} はナビを省き、配布用の体裁になる`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.emulateMedia({ media: "print" });

      // 画面用の chrome は消える
      await expect(page.locator("#back-to-top")).toBeHidden();
      await expect(page.getByLabel("メインナビゲーション")).toBeHidden();
      await expect(page.locator("#menu-toggle")).toBeHidden();
      await expect(page.locator(".mobile-menu")).toBeHidden();
      await expect(
        page.locator('body > footer section[aria-labelledby="footer-site"]')
      ).toBeHidden();
      // 出所とライセンス表示は残る。toContainText は textContent を読むので
      // display:none でも通ってしまう — 描画されていることを見る
      await expect(
        page.locator(".site-header").getByText("EduLaw")
      ).toBeVisible();
      const footer = page.locator("body > footer");
      await expect(footer.getByText("CC BY-SA 4.0")).toBeVisible();
      await expect(footer.getByText("©")).toBeVisible();

      // sticky を解き、配色をライトへ戻す(data-theme は dark のまま)
      const computed = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          headerPosition: getComputedStyle(
            document.querySelector(".site-header")!
          ).position,
          htmlBackground: root.backgroundColor,
          accent: root.getPropertyValue("--color-accent").trim(),
        };
      });
      expect(computed.headerPosition).toBe("static");
      expect(computed.htmlBackground).toBe("rgb(255, 255, 255)");
      expect(computed.accent).toBe("#6b4423");

      // 外部リンクは URL を併記する
      const external = page.locator('main a[target="_blank"]').first();
      const href = await external.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
      const after = await external.evaluate(
        (el) => getComputedStyle(el, "::after").content
      );
      expect(after).toContain(href!);
    });

    test(`${path} は 320px でも横に溢れない`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      await page.emulateMedia({ media: "print" });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
