import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const wiki = defineCollection({
  loader: glob({
    pattern: ["**/*.md", "!**/*.base", "!.obsidian/**"],
    base: "../.gd-wiki",
  }),
  schema: z
    .object({
      title: z.string(),
      updated: z
        .union([z.string(), z.date()])
        .transform((v) =>
          typeof v === "string" ? v : v.toISOString().slice(0, 10),
        )
        .optional(),
      tags: z.array(z.string()).optional(),
      summary: z.string().optional(),
    })
    .passthrough(),
});

export const collections = { wiki };
