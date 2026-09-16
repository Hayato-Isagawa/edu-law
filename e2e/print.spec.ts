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
      // .skip-link はフォーカス時だけ現れる。画面で出したうえで print で消えることを見る
      await page.locator(".skip-link").focus();
      await expect(page.locator(".skip-link")).toBeVisible();
      await page.emulateMedia({ media: "print" });
      // .link-underline は色に transition があり、切り替え直後は途中の色を返す
      await page.addStyleTag({
        content: "*{transition:none!important;animation:none!important}",
      });

      // 画面用の chrome は消える。#menu-toggle / .mobile-menu は 1280px では lg:hidden で
      // 元から消えていて判別力が無いので 320px の断面で見る。#reading-progress は未スクロール時
      // scaleX(0) で bounding box が空なので toBeHidden では判別できず、display で見る
      await expect(page.locator("#back-to-top")).toBeHidden();
      await expect(page.getByLabel("メインナビゲーション")).toBeHidden();
      await expect(page.locator(".skip-link")).toBeHidden();
      await expect(page.locator("#reading-progress")).toHaveCSS(
        "display",
        "none"
      );
      // フッターはサイト内リンク・説明文・姉妹サイトの見出しと一覧を落とし、ライセンス・
      // 連絡先・© は残す
      const footer = page.locator("body > footer");
      await expect(
        footer.locator('section[aria-labelledby="footer-site"]')
      ).toBeHidden();
      await expect(footer.locator("> div > div:first-child > p")).toBeHidden();
      await expect(footer.locator("#footer-sister-legal")).toBeHidden();
      await expect(footer.getByText("EduEvidence JP")).toBeHidden();
      await expect(footer.getByText("コード MIT")).toBeVisible();
      await expect(footer.getByText("law@edu-evidence.org")).toBeVisible();
      // 出所とライセンス表示は残る。toContainText は textContent を読むので
      // display:none でも通ってしまう — 描画されていることを見る
      await expect(
        page.locator(".site-header").getByText("EduLaw")
      ).toBeVisible();
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

      // リンクの下線は文字と同じ色にする(画面では --color-line の薄い灰色。紙では見えにくい)。
      // print の text-decoration: underline がショートハンドで下線色を currentcolor に戻す
      const links = [page.locator("main .link-underline").first()];
      if (path.startsWith("/laws/"))
        links.push(page.locator(".law-body a").first());
      for (const link of links) {
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        const { color, decorationColor } = await link.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { color: cs.color, decorationColor: cs.textDecorationColor };
        });
        expect(decorationColor).toBe(color);
      }
      // 改ページは見出しの直後と li の途中を避ける
      await expect(page.locator("main h2").first()).toHaveCSS(
        "break-after",
        "avoid"
      );
      await expect(page.locator("main li").first()).toHaveCSS(
        "break-inside",
        "avoid"
      );
    });

    test(`${path} は 320px でも横に溢れず、メニューも消える`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      // A4 幅(794px)は lg 未満なので、印刷側の規則が無いとメニューボタンが紙に出る。
      // 閉じた .mobile-menu は opacity 0 だが bounding box を持つので、display: none で
      // 落ちていることを toBeHidden で区別できる
      await expect(page.locator("#menu-toggle")).toBeVisible();
      await page.emulateMedia({ media: "print" });
      await expect(page.locator("#menu-toggle")).toBeHidden();
      await expect(page.locator(".mobile-menu")).toBeHidden();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("トップの発行元バッジはダークでも印刷用の色に戻り、法令行は途中で改ページしない", async ({
    page,
  }) => {
    // 発行元バッジ(LawRow)はトップで見る。print の :root が dark 側の再宣言に勝つことを見る
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ media: "print" });
    await page.addStyleTag({
      content: "*{transition:none!important;animation:none!important}",
    });
    const badge = page.locator(".law-row .text-badge-mext").first();
    await expect(badge).toHaveCSS("color", "rgb(126, 100, 68)");
    await expect(page.locator(".law-row").first()).toHaveCSS(
      "break-inside",
      "avoid"
    );
  });
});
