import { defineConfig } from "@playwright/test";

const dist = process.env.VRT_DIST ?? "dist";

export default defineConfig({
  testDir: "./vrt",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // リトライしない。ローカル(macOS)では同一ソースの 2 ビルドを撮り比べて差分 0
  // を実測している(maxDiffPixelRatio 0 でも threshold 0 でも 38 件全通過)。
  // CI(Linux)のノイズは 0 ではない — home の連続 2 枚は高さが 5〜9px 揺れる
  // (#194 / #195 の run で観測)。これを吸収しているのは Playwright の安定化
  // ループで、その収束条件は下の threshold / maxDiffPixels でも決まる。
  // 揺れの観測はどちらも旧設定(ratio 0.001)下のもの。完全一致にした後は #197 で
  // 3 回まわし、ベースライン撮影と比較の両ステップとも 38 件全通過で、収束失敗
  // ("Failed to take two consecutive stable screenshots")は 0 件だった。
  // リトライを入れると、そのループでも収まらなかった問題まで握り潰す。
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  snapshotPathTemplate: "vrt/__screenshots__/{projectName}/{arg}{ext}",
  expect: {
    timeout: 30000,
    toHaveScreenshot: {
      // 取り逃がしは 2 系統あり、比率だけでは片方しか塞がらない。
      //
      // 比率: 許容量 = 総ピクセル数 × 比率なので、ページの長さにそのまま比例する。
      // 0.001 での許容は mobile /search 462px 〜 desktop /laws 7063px で約 15 倍
      // 開き、長いページほど甘い。#194 の /scenes(公式解説名を 8 文字増やした)は
      // 差分 1036px に対して許容 5636px だったので通った。比率はやめる。
      //
      // 色差: #160 で省庁バッジの色を変えたとき検出しなかったのは、文字が 11px
      // 4 個と小さかったからではない。Playwright が pixelmatch に渡す threshold
      // (既定 0.2)未満の色差は差分として数えられないので、maxDiffPixelRatio を
      // 0 まで下げても検出できない(実測: ratio 0 では緑のまま、threshold 0 に
      // すると home が desktop 1980px / mobile 1953px の赤)。
      //
      // threshold と maxDiffPixels は最終判定だけでなく、撮影の安定化ループ
      // (連続 2 枚が一致するまで撮り直す)の収束条件でもある。収束しないと
      // expect.timeout に達して "Failed to take two consecutive stable
      // screenshots" で落ちる。
      threshold: 0,
      // threshold: 0 はバイト完全一致ではない。pixelmatch の includeAA(既定
      // false・Playwright は上書きしない)により、アンチエイリアスと判定された
      // 画素は差分に数えない。エッジだけが変わる変更は残る盲点。
      //
      // maxDiffPixels は未指定でも 0 になるが、型定義は "unset by default" と
      // しか書いておらず契約ではない。threshold の既定 0.2 がガードを黙って
      // 殺していたのと同じ形に戻さないため、明示する。
      maxDiffPixels: 0,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: "http://localhost:4175",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npx serve ${dist} -l 4175`,
    port: 4175,
    reuseExistingServer: !process.env.CI,
  },
});
