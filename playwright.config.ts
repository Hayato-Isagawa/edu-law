import { defineConfig } from "@playwright/test";

// ポートはファミリー各リポで固定する(evi 4173 / watch 4174 / law の VRT 4175 /
// okinawa の preview 4176 / portfolio の VRT 4177)。別プロジェクトのサーバーに
// 当たると、別サイトを検査して通ってしまう。
const PORT = 4178;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 登場アニメーションの途中は opacity が 1 未満で、その瞬間に axe が走ると
    // 色コントラスト違反として検出される。静止状態を検査する。
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    // serve は devDependencies に入れてある。入れずに npx で呼ぶと CI が
    // 実行のたびに npm から最新版を取ってきて走らせることになる。
    command: `npx serve dist -l ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
