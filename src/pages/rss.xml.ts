import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const laws = await getCollection("laws");
  laws.sort((a, b) => b.data.lastVerified.localeCompare(a.data.lastVerified));

  return rss({
    title: "EduLaw JP — 教師向け教育関連法 公式解説整理",
    description:
      "日本の小学校教員向けに、教育関連法と公式解説(文科省・文化庁・厚労省・e-Gov)を法令別に整理。",
    site: context.site?.toString() ?? "https://law.edu-evidence.org",
    items: laws.map((law) => ({
      title: law.data.title,
      description: law.data.summary,
      pubDate: new Date(`${law.data.lastVerified}T00:00:00+09:00`),
      link: `/laws/${law.id}/`,
      categories: law.data.tags,
    })),
    customData: "<language>ja</language>",
  });
}
