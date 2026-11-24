import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

test.describe("本文のリンク", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of [
      "/about/",
      "/laws/basic-act-on-education/",
      "/guides/legal-hierarchy/",
    ]) {
      test(`地の文と色が違い、下線がある(${theme}): ${path}`, async ({
        browser,
      }) => {
        const context = await browser.newContext({ colorScheme: theme });
        const page = await context.newPage();
        await page.goto(path);
        const links = await page.locator("main").evaluate((main) =>
          [...main.querySelectorAll("a[href]")]
            .filter(
              (a) =>
                getComputedStyle(a).display.startsWith("inline") &&
                a.matches(".link-underline, .law-body a") &&
                !a.closest("nav, h1, h2, h3, h4, header")
            )
            .map((a) => ({
              text: a.textContent!.trim().slice(0, 20),
              color: getComputedStyle(a).color,
              around: getComputedStyle(a.parentElement!).color,
              underlined:
                getComputedStyle(a).borderBottomStyle === "solid" &&
                parseFloat(getComputedStyle(a).borderBottomWidth) >= 1,
            }))
        );
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.underlined, link.text).toBe(true);
          expect(link.color, link.text).not.toBe(link.around);
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

test("折り返した外部リンクは、どの行にも線が付く", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/laws/");
  // 箱(inline-flex)のままだと、線は最後の行にしか付かない
  const links = await page
    .locator("main li a.link-underline[target=_blank]")
    .evaluateAll((els) =>
      els.map((el) => ({
        display: getComputedStyle(el).display,
        rects: el.getClientRects().length,
      }))
    );
  expect(links.length).toBeGreaterThan(0);
  expect(new Set(links.map((l) => l.display))).toEqual(new Set(["inline"]));
  expect(Math.max(...links.map((l) => l.rects))).toBeGreaterThan(1);
});

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
    // 変数を効かせたとき、検索だけが 1.25 倍に大きくならないように
    await expect(page.locator(".pagefind-ui__search-input")).toHaveCSS(
      "font-size",
      "16.8px"
    );
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

test("下線の太さを text-decoration の一括指定にまとめていない", () => {
  // 太さ入りの一括指定を読めない Safari(26.1 以前)では、下線ごと消える。描画は Chromium でしか
  // 見ないので、配る CSS を直接見る
  const dist = path.resolve(process.cwd(), "dist");
  const files = fs
    .readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        /\.(css|html)$/.test(e.name) &&
        !e.parentPath.includes("pagefind")
    )
    .map((e) => path.join(e.parentPath, e.name));
  const css = files.filter((f) => f.endsWith(".css"));
  expect(css.length).toBeGreaterThan(0);
  let longhand = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    expect(source, path.relative(dist, file)).not.toMatch(
      /text-decoration:\s*underline\s+[\d.]+px\s*[;}]/
    );
    if (source.includes("text-decoration-thickness:1px")) longhand++;
  }
  expect(longhand).toBeGreaterThan(0);
});

test("見出し・ナビ・ヘッダーの中のリンクは本文の規則を受けない", async ({
  page,
}) => {
  await page.goto("/about/");
  const result = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const accent = document.createElement("i");
    accent.style.color = "var(--color-accent)";
    main.append(accent);
    const read = (html: string) => {
      const box = document.createElement("div");
      box.innerHTML = html;
      main.append(box);
      const s = getComputedStyle(box.querySelector("a")!);
      return {
        color: s.color,
        line: s.borderBottomWidth,
      };
    };
    const link = '<a href="/" class="link-underline">x</a>';
    return {
      accent: getComputedStyle(accent).color,
      body: read(`<p>${link}</p>`),
      excluded: [
        ...["h1", "h2", "h3", "h4"].map((t) => read(`<${t}>${link}</${t}>`)),
        read(`<nav><p>${link}</p></nav>`),
        read(`<header><p>${link}</p></header>`),
      ],
    };
  });
  expect(result.body.color).toBe(result.accent);
  expect(result.body.line).toBe("1px");
  for (const r of result.excluded) {
    expect(r.color).not.toBe(result.accent);
    expect(r.line).toBe("0px");
  }
});

test("既定の文字が小さいブラウザで、メニューを開いたまま幅を広げても本文が触れる", async ({
  page,
}) => {
  // メニューを隠す lg は 64rem。既定の文字を 12px にすると 768px で切り替わる
  const client = await page.context().newCDPSession(page);
  await client.send("Page.setFontSizes", {
    fontSizes: { standard: 12, fixed: 12 },
  });
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.locator("#menu-toggle")).toBeHidden();
  await expect(page.locator("main")).not.toHaveAttribute("inert");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`ホバーとフォーカスで、下線が消えて左端から線が引かれる(reduced-motion: ${reducedMotion})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.goto("/laws/basic-act-on-education/");
    const link = page.locator("main .law-body a").first();
    await link.scrollIntoViewIfNeeded();
    const read = () =>
      link.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          size: s.backgroundSize,
          line: s.borderBottomWidth,
          color: s.borderBottomColor,
          origin: s.backgroundOrigin,
          position: s.backgroundPosition,
          duration: Math.max(
            ...s.transitionDuration.split(",").map(parseFloat)
          ),
          property: s.transitionProperty,
        };
      });
    const rest = await read();
    expect(rest.size).toMatch(/^0%/);
    expect(rest.line).toBe("1px");
    // 左端から引く。border の箱の下端に置くので、平常時の線と位置がそろう
    expect(rest.position).toMatch(/^0(px|%) 100%$/);
    expect(rest.origin).toBe("border-box");
    expect(rest.color).not.toBe("rgba(0, 0, 0, 0)");
    if (reducedMotion === "reduce") expect(rest.duration).toBe(0);
    else {
      expect(rest.duration).toBeGreaterThan(0);
      expect(rest.property).toContain("background-size");
    }

    await link.hover();
    if (reducedMotion === "reduce") expect((await read()).duration).toBe(0);
    await expect.poll(async () => (await read()).size).toBe("100% 2px");
    await expect
      .poll(async () => (await read()).color)
      .toBe("rgba(0, 0, 0, 0)");

    await page.mouse.move(0, 0);
    await expect.poll(async () => (await read()).size).toMatch(/^0%/);
    await page.keyboard.press("Tab");
    await link.focus();
    await expect.poll(async () => (await read()).size).toBe("100% 2px");
    await context.close();
  });
}

/** 下線(半透明を含む)と背景の比。色の形式と半透明は canvas で重ねて読む */
const underlineRatios = (root: Element) => {
  const canvas = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true })!;
  const pixel = (layers: string[]) => {
    canvas.clearRect(0, 0, 1, 1);
    for (const layer of layers) {
      canvas.fillStyle = layer;
      canvas.fillRect(0, 0, 1, 1);
    }
    return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return [...root.querySelectorAll("a[href]")]
    .filter(
      (a) =>
        getComputedStyle(a).display.startsWith("inline") &&
        parseFloat(getComputedStyle(a).borderBottomWidth) >= 1 &&
        getComputedStyle(a).backgroundImage.includes("gradient") &&
        !a.closest("nav, h1, h2, h3, h4, header")
    )
    .map((a) => {
      const layers: string[] = [];
      for (let e: Element | null = a; e; e = e.parentElement) {
        layers.unshift(getComputedStyle(e).backgroundColor);
      }
      const line = getComputedStyle(a).borderBottomColor;
      const [hi, lo] = [lum(pixel(layers)), lum(pixel([...layers, line]))].sort(
        (x, y) => y - x
      );
      const [hi2, lo2] = [
        lum(pixel(layers)),
        lum(pixel([...layers, getComputedStyle(a).color])),
      ].sort((x, y) => y - x);
      return {
        text: a.textContent!.trim().slice(0, 20),
        ratio: (hi + 0.05) / (lo + 0.05),
        full: (hi2 + 0.05) / (lo2 + 0.05),
      };
    });
};

for (const theme of ["light", "dark"] as const) {
  for (const path of [
    "/",
    "/about/",
    "/laws/basic-act-on-education/",
    "/guides/",
    "/guides/legal-hierarchy/",
  ]) {
    test(`平常時の下線は文字より薄く、背景と 3:1 以上(${theme}): ${path}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme: theme });
      const page = await context.newPage();
      await page.goto(path);
      const lines = await page.locator("main").evaluate(underlineRatios);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.ratio, line.text).toBeGreaterThanOrEqual(3);
        expect(line.ratio, line.text).toBeLessThan(line.full);
      }
      await context.close();
    });
  }
}
