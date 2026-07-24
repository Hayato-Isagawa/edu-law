// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import rehypeExternalLinks from "rehype-external-links";
import { unified } from "@astrojs/markdown-remark";

export default defineConfig({
  site: "https://law.edu-evidence.org",
  // Astro 7 は空白を JSX ルールで除去する('jsx' 既定)。v6 の挙動を維持するため true に固定する。
  compressHTML: true,
  integrations: [react(), sitemap()],
  markdown: {
    // Astro 7 の既定 Markdown プロセッサは Sätteri で remark/rehype を無視する。
    // 従来の unified パイプライン(rehype-external-links)を維持するため processor に unified() を指定する。
    processor: unified(),
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: "_blank",
          rel: ["noopener", "noreferrer"],
        },
      ],
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
