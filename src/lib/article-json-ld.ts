const siteUrl = "https://law.edu-evidence.org";

/**
 * ガイドページの Article JSON-LD。姉妹サイト(edu-evidence のコラム / edu-watch の digest)と
 * 同じ形で、著者・発行者・URL を機械可読にする。
 *
 * 日付は載せない。ガイドに公開日・更新日のフィールドが無く、本文の「取得日」は公式資料を
 * 取得した日であって記事の日付ではない。`src/data/changelog.ts` の `add` はガイドへのリンクを
 * 持つが、節の追加でも付くので公開日の意味を保証しない。推測で埋めない。
 */
export function guideArticleJsonLd(args: {
  /** `<title>` と同じ文字列でよい。末尾の「 — EduLaw JP」は落とす */
  title: string;
  description: string;
  /** `Astro.url.pathname`。末尾スラッシュ付き */
  path: string;
}): object {
  const url = new URL(args.path, siteUrl).href;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: args.title.replace(/ — EduLaw JP$/, ""),
    description: args.description,
    author: {
      "@type": "Person",
      name: "Isagawa Hayato",
      url: `${siteUrl}/about/`,
      sameAs: ["https://github.com/Hayato-Isagawa"],
    },
    publisher: {
      "@type": "Organization",
      name: "EduLaw JP",
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`,
    },
    mainEntityOfPage: url,
    url,
    inLanguage: "ja",
  };
}
