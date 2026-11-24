import { test, expect } from "@playwright/test";

test.describe("本文のリンクの下線", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of [
      "/about/",
      "/laws/basic-act-on-education/",
      "/guides/legal-hierarchy/",
    ]) {
      test(`地の文と色が違い、下線と背景の比が 3:1 以上(${theme}): ${path}`, async ({
        browser,
      }) => {
        const context = await browser.newContext({ colorScheme: theme });
        const page = await context.newPage();
        await page.goto(path);
        const links = await page.locator("main").evaluate((main) => {
          const rgb = (c: string) => c.match(/[\d.]+/g)!.map(Number);
          const lum = (c: string) => {
            const [r, g, b] = rgb(c).map((v) => {
              const x = v / 255;
              return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const background = (el: Element | null): string => {
            for (let e = el; e; e = e.parentElement) {
              const c = getComputedStyle(e).backgroundColor;
              if (rgb(c)[3] !== 0) return c;
            }
            return getComputedStyle(document.body).backgroundColor;
          };
          return [...main.querySelectorAll("a[href]")]
            .filter(
              (a) =>
                getComputedStyle(a).display === "inline" &&
                !a.closest("nav, h1, h2, h3, h4") &&
                a.parentElement!.textContent!.trim().length -
                  a.textContent!.trim().length >=
                  8
            )
            .map((a) => {
              const s = getComputedStyle(a);
              const [hi, lo] = [
                lum(s.textDecorationColor),
                lum(background(a)),
              ].sort((x, y) => y - x);
              return {
                text: a.textContent!.trim().slice(0, 20),
                color: s.color,
                around: getComputedStyle(a.parentElement!).color,
                underlined: s.textDecorationLine.includes("underline"),
                ratio: (hi + 0.05) / (lo + 0.05),
              };
            });
        });
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.underlined, link.text).toBe(true);
          expect(link.color, link.text).not.toBe(link.around);
          expect(link.ratio, link.text).toBeGreaterThanOrEqual(3);
        }
        await context.close();
      });
    }
  }
});

for (const path of ["/about/", "/laws/basic-act-on-education/"]) {
  test(`印刷では本文のリンクも黒になる: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.emulateMedia({ media: "print" });
    await page.addStyleTag({ content: "*{transition:none!important}" });
    const links = page.locator("main :is(p .link-underline, .law-body a)");
    expect(await links.count()).toBeGreaterThan(0);
    for (const color of await links.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color)
    )) {
      expect(["rgb(0, 0, 0)", "rgb(51, 51, 51)"]).toContain(color);
    }
  });
}

test("フッターのリンクの色は変えない", async ({ page }) => {
  await page.goto("/");
  const links = page.locator("body > footer .link-underline");
  expect(await links.count()).toBeGreaterThan(0);
  const accent = await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--color-accent)";
    document.body.append(probe);
    return getComputedStyle(probe).color;
  });
  for (const color of await links.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).color)
  )) {
    expect(color).not.toBe(accent);
  }
});

test.describe("テーマとブラウザの部品", () => {
  for (const [os, theme] of [
    ["light", "dark"],
    ["dark", "light"],
  ] as const) {
    test(`OS が ${os} でもサイトが ${theme} なら部品も ${theme}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme: os });
      await context.addInitScript(
        (t) => localStorage.setItem("theme", t),
        theme
      );
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
      await page.emulateMedia({ media: "print" });
      await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
      await context.close();
    });
  }

  test("ダークの検索結果の線とボタンがテーマの色になる", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/search/");
    await page.locator(".pagefind-ui__search-input").fill("教育");
    await expect(page.locator(".pagefind-ui__result").first()).toBeVisible();
    await page.addStyleTag({ content: "*{transition:none!important}" });
    const line = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--color-line)";
      document.body.append(probe);
      return getComputedStyle(probe).color;
    });
    await expect(page.locator(".pagefind-ui__result").first()).toHaveCSS(
      "border-top-color",
      line
    );
    const button = page.locator(".pagefind-ui__button").first();
    await expect(button).toBeVisible();
    expect(
      await button.evaluate((el) => getComputedStyle(el).backgroundColor)
    ).not.toBe("rgb(255, 255, 255)");
    await context.close();
  });
});
