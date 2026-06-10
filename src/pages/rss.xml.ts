import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { changelogEntries, typeLabel } from "../data/changelog";

export async function GET(context: APIContext) {
  return rss({
    title: "EduLaw JP — 更新履歴",
    description:
      "教育関連法と公式解説の整理ポータル EduLaw JP の更新情報。ページの追加・公式解説の改訂などを配信します。",
    site: context.site?.toString() ?? "https://law.edu-evidence.org",
    // リンクは /changelog/#d-{date} 形式。自動の trailingSlash 付与はフラグメントの
    // 後ろに付いてアンカーを壊すため無効化する(パス側の / はリンク文字列に含めてある)
    trailingSlash: false,
    items: changelogEntries.map((entry) => {
      const first = entry.items[0];
      const chars = Array.from(first.text);
      const head = chars.length > 60 ? `${chars.slice(0, 60).join("")}…` : first.text;
      const rest = entry.items.length - 1;
      return {
        title: `${typeLabel[first.type].label}: ${head}${rest > 0 ? `(ほか ${rest} 件)` : ""}`,
        description: entry.items
          .map((item) => `${typeLabel[item.type].label}: ${item.text}`)
          .join("\n"),
        pubDate: new Date(`${entry.date}T00:00:00+09:00`),
        link: `/changelog/#d-${entry.date}`,
      };
    }),
    customData: "<language>ja</language>",
  });
}
