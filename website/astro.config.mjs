import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";
import remarkWikiLink from "remark-wiki-link";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wikiRoot = fileURLToPath(new URL("../.gd-wiki", import.meta.url));

function buildWikiPermalinks(root) {
  const byBasename = new Map();
  const byPath = new Set();

  function walk(dir, prefix = "") {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.startsWith(".")) continue;
      const full = path.join(dir, ent);
      const rel = prefix ? `${prefix}/${ent}` : ent;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
      } else if (ent.endsWith(".md")) {
        const slug = rel.replace(/\.md$/, "");
        const basename = path.basename(ent, ".md");
        byPath.add(slug);
        if (!byBasename.has(basename)) byBasename.set(basename, slug);
      }
    }
  }
  walk(root);
  return { byBasename, byPath };
}

const { byBasename, byPath } = buildWikiPermalinks(wikiRoot);

// Floor-assert: catches the Vercel "Include source files outside Root Directory" toggle being OFF.
// Without that toggle, .gd-wiki/ is not in the build container and byPath is empty,
// which would silently produce a docless site.
const MIN_WIKI_FILES = 5;
if (byPath.size < MIN_WIKI_FILES) {
  throw new Error(
    `[wiki-floor-assert] Found ${byPath.size} wiki Markdown files at ${wikiRoot}. ` +
      `Expected at least ${MIN_WIKI_FILES}. ` +
      `On Vercel, ensure Project Settings → Build & Deployment → Root Directory has ` +
      `"Include source files outside of the Root Directory in the Build Step" ENABLED. ` +
      `Locally, ensure ../.gd-wiki/ exists relative to website/.`,
  );
}

function resolveWikiName(name) {
  if (byPath.has(name)) return name;
  const hit = byBasename.get(name);
  if (hit) return hit;
  return name;
}

export default defineConfig({
  site: "https://glassdesk.vercel.app",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/llms-full"),
    }),
    pagefind(),
  ],
  vite: {
    build: {
      rollupOptions: {
        external: [/^\/pagefind\//],
      },
    },
  },
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        {
          permalinks: [...byPath],
          pageResolver: (name) => [resolveWikiName(name)],
          hrefTemplate: (permalink) => `/docs/${permalink}`,
          aliasDivider: "|",
        },
      ],
    ],
  },
});
