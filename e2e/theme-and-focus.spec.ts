import { test, expect, type Page } from "@playwright/test";

const theme = (page: Page) => page.locator("html").getAttribute("data-theme");
const saved = (page: Page) =>
  page.evaluate(() => localStorage.getItem("theme"));

test.describe("テーマの切替", () => {
  for (const [name, width, button] of [
    ["ヘッダー", 1280, "#theme-toggle"],
    ["モバイルメニュー", 390, "#theme-toggle-mobile"],
  ] as const) {
    test(`OS と同じテーマへ戻すと保存が消え、OS の設定に従う(${name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/");
      if (width < 1024) await page.locator("#menu-toggle").click();
      const toggle = page.locator(button);

      await toggle.click();
      expect(await theme(page)).toBe("dark");
      expect(await saved(page)).toBe("dark");

      await toggle.click();
      expect(await theme(page)).toBe("light");
      expect(await saved(page)).toBeNull();

      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.reload();
      expect(await theme(page)).toBe("dark");
    });
  }

  test("OS と違うテーマを選んだら、OS の設定が後から変わっても保つ", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.locator("#theme-toggle").click();
    expect(await saved(page)).toBe("light");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(100);
      expect(await theme(page)).toBe("light");
      expect(await saved(page)).toBe("light");
    }
    await page.reload();
    expect(await theme(page)).toBe("light");
  });
});

test.describe("フォーカス", () => {
  test("強制カラーで、検索欄のフォーカスの輪郭が消えない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.emulateMedia({ forcedColors: "active" });
    const outline = (selector: string) =>
      page.locator(selector).evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.outlineStyle, parseFloat(style.outlineWidth)] as const;
      });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const menuInput = page.locator("#mobile-menu-search-input");
    await menuInput.focus();
    await expect(menuInput).toBeFocused();
    const [menuStyle, menuWidth] = await outline("#mobile-menu-search-input");
    expect(menuStyle).toBe("solid");
    expect(menuWidth).toBeGreaterThanOrEqual(2);

    await page.goto("/search/");
    await page.locator(".pagefind-ui__search-input").focus();
    const [style, width] = await outline(".pagefind-ui__search-input");
    expect(style).toBe("solid");
    expect(width).toBeGreaterThanOrEqual(2);
  });

  test("戻るボタンを押した後、見えなくなったボタンにフォーカスが残らない", async ({
    page,
  }) => {
    await page.goto("/laws/school-education-act/");
    const button = page.locator("#back-to-top");
    await page.evaluate(() =>
      window.scrollTo({ top: 1500, behavior: "instant" })
    );
    await expect(button).toHaveAttribute("data-state", "visible");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#main-content")).toBeFocused();
    // フォーカスを移しても、上までのスクロールは途切れない
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("戻るボタンにフォーカスが無ければ、フォーカスを動かさない", async ({
    page,
  }) => {
    await page.goto("/laws/school-education-act/");
    await page.evaluate(() =>
      window.scrollTo({ top: 1500, behavior: "instant" })
    );
    await expect(page.locator("#back-to-top")).toHaveAttribute(
      "data-state",
      "visible"
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator("#back-to-top")).toHaveAttribute(
      "data-state",
      "hidden"
    );
    await expect(page.locator("#main-content")).not.toBeFocused();
  });
});

test("読了バーは飾りで、支援技術に値を流さない", async ({ page }) => {
  await page.goto("/guides/legal-hierarchy/");
  const bar = page.locator("#reading-progress");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    })
  );
  await expect
    .poll(async () => Number(await bar.getAttribute("data-progress")))
    .toBeGreaterThanOrEqual(90);
  expect(
    await bar.evaluate((el) =>
      el
        .getAttributeNames()
        .filter((name) => name === "role" || name.startsWith("aria-value"))
    )
  ).toEqual([]);
});

test("検索を読み込めないとき、読者に向けた文が出る", async ({ page }) => {
  await page.route("**/pagefind/pagefind-ui.js", (route) => route.abort());
  await page.goto("/search/");
  const fallback = page.locator("#search-fallback");
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText("検索を読み込めませんでした");
  await expect(fallback).not.toContainText("npm");
});

test.describe("ナビの現在地", () => {
  const current = (page: Page, nav: string) =>
    page
      .locator(`nav[aria-label="${nav}"] [aria-current]`)
      .evaluateAll((els) =>
        els.map((el) => [
          el.getAttribute("href"),
          el.getAttribute("aria-current"),
        ])
      );

  for (const [path, href, value] of [
    ["/", "/", "page"],
    ["/laws/", "/laws/", "page"],
    ["/laws/school-education-act/", "/laws/", "true"],
    ["/guides/legal-hierarchy/", "/guides/", "true"],
    ["/search/", "/search/", "page"],
  ] as const) {
    test(`${path} では ${href ?? "どの項目も"} ${value ?? "印を付けない"}`, async ({
      page,
    }) => {
      await page.goto(path);
      let found = 0;
      for (const nav of ["メインナビゲーション", "サイトナビゲーション"]) {
        const expected =
          href === null ||
          !(await page
            .locator(`nav[aria-label="${nav}"] a[href="${href}"]`)
            .count())
            ? []
            : [[href, value]];
        found += expected.length;
        expect(await current(page, nav)).toEqual(expected);
      }
      if (href !== null) expect(found).toBeGreaterThan(0);
    });
  }
});

test.describe("モバイルメニュー", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("開くと、最初の項目の検索欄にフォーカスが移る", async ({ page }) => {
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    await expect(page.locator("#mobile-menu-search-input")).toBeFocused();
  });

  test("テーマの切替に、読み上げの名前と同じ文字のラベルが付く", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const toggle = page.locator("#theme-toggle-mobile");
    for (const label of ["ダークモードに切り替え", "ライトモードに切り替え"]) {
      await expect(toggle).toHaveText(label);
      await expect(toggle).toHaveAttribute("aria-label", label);
      const box = (await toggle.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
    }
  });
});

test("戻るボタンのホバーは、テーマのホバー色になる", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/guides/legal-hierarchy/");
    await page.evaluate(() =>
      window.scrollTo({ top: 1500, behavior: "instant" })
    );
    const button = page.locator("#back-to-top");
    await expect(button).toHaveAttribute("data-state", "visible");
    await button.hover();
    const hover = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-accent-hover)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(button).toHaveCSS("background-color", hover);
    await expect(button).toHaveCSS("transform", "none");
  }
});

test.describe("指の端末", () => {
  test.use({ hasTouch: true, viewport: { width: 1180, height: 820 } });

  test("ヘッダーのナビは、どれも 44px 以上で押せる", async ({ page }) => {
    await page.goto("/");
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
    ).toBe(true);
    const boxes = await page
      .locator('nav[aria-label="メインナビゲーション"] :is(a, button)')
      .evaluateAll((els) =>
        els.map((el) => {
          const { width, height, left, right } = el.getBoundingClientRect();
          return { width, height, left, right };
        })
      );
    expect(boxes).toHaveLength(7);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    // 隣どうしで重ならない
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right);
    }
  });
});

test("外部リンクの「↗」だけが次の行に落ちない", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  let checked = 0;
  for (const path of ["/laws/", "/about/", "/guides/legal-hierarchy/"]) {
    await page.goto(path);
    // 折り返す位置は幅で変わるので、細かく振る
    const result = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const spans = [
        ...main.querySelectorAll(
          "a.link-underline.inline-flex > [aria-hidden]"
        ),
      ].filter((span) => !span.closest("h1, h2, h3, h4, nav, header"));
      const alone = new Set<string>();
      for (let width = 260; width <= 420; width += 4) {
        main.style.width = `${width}px`;
        for (const span of spans) {
          const link = span.parentElement!;
          const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
          let last: Text | null = null;
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (span.contains(n)) break;
            if (n.textContent!.trim()) last = n as Text;
          }
          const end = last!.textContent!.trimEnd().length;
          const range = document.createRange();
          range.setStart(last!, end - 1);
          range.setEnd(last!, end);
          const arrow = span.getBoundingClientRect();
          if (arrow.top >= range.getBoundingClientRect().bottom) {
            alone.add(`${width}px ${link.textContent!.trim()}`);
          }
        }
      }
      return { count: spans.length, alone: [...alone] };
    });
    checked += result.count;
    expect(result.alone, path).toEqual([]);
  }
  expect(checked).toBeGreaterThan(20);
});
