import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const laws = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/laws" }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().min(1).max(10),
    summary: z.string(),
    eGovUrl: z
      .string()
      .url()
      .regex(/^https:\/\/laws\.e-gov\.go\.jp\//),
    officialExplanations: z
      .array(
        z.object({
          publisher: z.string().min(1),
          title: z.string(),
          url: z
            .string()
            .url()
            .regex(/^https:\/\/[^/]+\.go\.jp\//),
          publishedAt: z.string().optional(),
          retrievedAt: z.string().optional(),
          format: z.enum(["pdf", "html"]).optional(),
        }),
      )
      .min(1),
    lastVerified: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { laws };
