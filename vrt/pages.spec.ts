import { test, expect } from "@playwright/test";

const pages = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "changelog", path: "/changelog" },
  { name: "search", path: "/search" },
  { name: "scenes", path: "/scenes" },
  { name: "laws-index", path: "/laws" },
  { name: "law-detail", path: "/laws/school-education-act" },
  { name: "guides-index", path: "/guides" },
  { name: "guide-childcare-work-balance", path: "/guides/childcare-work-balance" },
  { name: "guide-customer-harassment", path: "/guides/customer-harassment" },
  { name: "guide-disciplinary-disposition", path: "/guides/disciplinary-disposition" },
  { name: "guide-legal-hierarchy", path: "/guides/legal-hierarchy" },
  { name: "guide-non-regular-teachers", path: "/guides/non-regular-teachers" },
  { name: "guide-occupational-injury", path: "/guides/occupational-injury" },
  { name: "guide-occupational-safety-health", path: "/guides/occupational-safety-health" },
  { name: "guide-parent-response", path: "/guides/parent-response" },
  { name: "guide-school-accident", path: "/guides/school-accident" },
  { name: "guide-teacher-mental-health", path: "/guides/teacher-mental-health" },
  { name: "guide-work-style-reform", path: "/guides/work-style-reform" },
  { name: "not-found", path: "/404" },
];

for (const p of pages) {
  test(p.name, async ({ page }) => {
    await page.goto(p.path, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${p.name}.png`, { fullPage: true });
  });
}
