import satori from "satori";
import type { ReactNode } from "react";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

// edu-evidence scripts/generate-default-og.ts のミラー(姉妹サイト共通 OG テンプレート)。
// 差分は config(コピー・アクセント色・ドメイン)と出力ファイル名のみ。

interface SiteOgConfig {
  siteNameMain: string;
  siteNameAccent: string;
  headlineLines: string[];
  sub: string;
  domainLabel: string;
  accentColor: string;
}

const config: SiteOgConfig = {
  siteNameMain: "EduLaw",
  siteNameAccent: "JP",
  headlineLines: ["条文と公式解説を、", "教師の判断へ。"],
  sub: "判断の前に、原典を一度。",
  domainLabel: "law.edu-evidence.org",
  accentColor: "#6b4423",
};

// サイトヘッダー(SiteHeader.astro)と同じブランド行を再現するための
// 根ロゴ(Logo.astro と同ジオメトリ、色はアクセント固定)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none">
  <line x1="60" y1="10" x2="60" y2="18" stroke="${config.accentColor}" stroke-width="3" stroke-linecap="round" />
  <line x1="60" y1="18" x2="60" y2="112" stroke="${config.accentColor}" stroke-width="4" stroke-linecap="round" />
  <line x1="60" y1="38" x2="30" y2="52" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="38" x2="90" y2="52" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="62" x2="22" y2="76" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="62" x2="98" y2="76" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="86" x2="38" y2="108" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="86" x2="82" y2="108" stroke="${config.accentColor}" stroke-width="2.5" stroke-linecap="round" />
</svg>`;
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

const FONT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "fonts",
  "noto-sans-jp-bold.bin",
);

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  const buf = await fs.readFile(FONT_PATH);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

async function buildDefaultOg(): Promise<Buffer> {
  const fontData = await loadNotoSansJpFont();

  const headlineParts: Array<Record<string, unknown>> = [];
  config.headlineLines.forEach((line, i) => {
    headlineParts.push({
      type: "div",
      props: {
        style: {
          fontSize: "84px",
          fontWeight: 900,
          color: "#1a1a1a",
          lineHeight: 1.18,
          letterSpacing: "-0.01em",
        },
        children: line,
      },
      key: `line-${i}`,
    });
  });

  const element = {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#faf9f5",
        fontFamily: "Noto Sans JP",
        position: "relative",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: "0",
              top: "0",
              width: "8px",
              height: "100%",
              background: config.accentColor,
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "28px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  },
                  children: [
                    {
                      type: "img",
                      props: {
                        src: logoDataUri,
                        width: 64,
                        height: 64,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: "46px",
                          fontWeight: 900,
                          letterSpacing: "-0.01em",
                        },
                        children: [
                          {
                            type: "span",
                            props: {
                              style: {
                                color: "#1a1a1a",
                                marginRight: "12px",
                              },
                              children: config.siteNameMain,
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: { color: config.accentColor },
                              children: config.siteNameAccent,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                  },
                  children: headlineParts,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "26px",
                    color: "#3a3a36",
                    fontWeight: 700,
                  },
                  children: config.sub,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "18px",
                    color: "#6b6b66",
                    letterSpacing: "0.02em",
                  },
                  children: config.domainLabel,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(element as unknown as ReactNode, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Noto Sans JP",
        data: fontData,
        weight: 700,
        style: "normal" as const,
      },
    ],
  });

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function main(): Promise<void> {
  const outPath = path.resolve(process.cwd(), "public", "og-default.png");
  const buf = await buildDefaultOg();
  await fs.writeFile(outPath, buf);
  process.stdout.write(`generated: ${outPath} (${buf.byteLength} bytes)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`failed to generate default OG: ${String(err)}\n`);
  process.exit(1);
});
