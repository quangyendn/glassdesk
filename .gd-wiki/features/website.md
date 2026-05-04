---
title: "Website (Astro 5)"
updated: 2026-05-04
tags: [category/feature, website, astro, documentation]
summary: "The glassdesk public website is an Astro 5 site that sources its content directly from .gd-wiki/, treating the wiki vault as the single source of truth for docs."
---

The `website/` directory contains an Astro 5 static site that replaces the original static `index.html` landing page. Content is sourced directly from `.gd-wiki/` — the wiki vault is the canonical content store.

## Architecture

```
website/
├── astro.config.mjs          # Astro config; .gd-wiki/ registered as content collection source
├── src/
│   ├── content.config.ts     # defines "docs" collection rooted at ../.gd-wiki/
│   ├── pages/
│   │   ├── index.astro       # landing page
│   │   └── docs/[...slug].astro  # dynamic route — renders any .gd-wiki/ page
│   ├── layouts/
│   │   ├── Base.astro        # HTML shell, global styles, OG meta
│   │   └── DocPage.astro     # wiki page layout (sidebar, breadcrumb, content)
│   └── components/
│       ├── Sidebar.astro     # nav tree reflecting .gd-wiki/ folder structure
│       ├── Breadcrumb.astro  # path breadcrumb
│       ├── Header.astro      # site header
│       ├── Footer.astro      # site footer
│       └── Search.astro      # client-side search component
└── public/
    ├── llms.txt              # LLM-readable site index (static)
    └── robots.txt            # crawler policy
```

The dynamic `docs/[...slug].astro` route maps `.gd-wiki/<category>/<page>.md` to `/docs/<category>/<page>`. Obsidian frontmatter (`title`, `updated`, `tags`) is consumed by the layout for metadata and breadcrumbs.

## Content Collection

`src/content.config.ts` registers a `docs` Astro content collection pointed at `../.gd-wiki/`. This means every wiki page (except `.obsidian/` config files) is automatically available as a route — no manual content duplication.

`website/src/pages/llms-full.txt.ts` generates a machine-readable full-text dump of all wiki pages for LLM indexing.

## Key Design Decisions

- **Wiki as SoT**: content lives in `.gd-wiki/`, not duplicated in `website/src/content/`. The site is a rendering layer only.
- **No CMS**: Astro content collections read markdown files directly from the vault on build; no database, no headless CMS.
- **`manual/` and `insights/` exclusion**: the content collection excludes `manual/` and `insights/` subfolders from public rendering (human-private and session-only content respectively).

## LLM Crawlability

`public/llms.txt` provides a structured index following the `llms.txt` convention. `llms-full.txt.ts` generates a full-text version at build time from all wiki pages. Both are intended to make the site's knowledge accessible to LLM-powered tools.

## Styles & Typography

> **Pencil design refresh complete (2026-05-04)**

`website/src/styles/global.css` defines a structured CSS token system:
- **Backgrounds:** `--bg-primary/secondary/card/elevated`
- **Borders:** `--border-subtle/strong`
- **Accents:** `--accent-cyan/neon/violet`
- **Text:** `--text-primary/secondary/muted`
- **Layout:** `--maxw-*`, `--radius-*`

All legacy alias tokens (`--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--code-bg/fg`) have been removed and every consumer migrated to the new token system.

Fonts: **Geist** (heading, 400–700) and **Geist Mono** (mono, 400–600) are self-hosted via the `geist` npm package; **Inter** (body) is loaded from Google Fonts. CSS custom properties: `--font-heading`, `--font-body`, `--font-mono`.

Components: `Header`, `Footer`, `Search`, `Sidebar`, `Breadcrumb`, `DocPage`, `Icon`, `NeonStreaks`.

Landing page (`index.astro`): 5 sections — Hero, Install, Capabilities, Documentation, CTA.

### Pencil design refresh (2026-05-04)

Five-phase refresh from Pencil designs, completed 2026-05-04.

**Phase 01 — Token system:** `global.css` restructured with semantic background, border, accent, text, and layout tokens; dark-mode foundation established.

**Phase 02 — Header, Footer & Icon system:** `Icon.astro` added (lucide-static backed); `Header.astro` rewritten with sticky/backdrop-blur bar, neon brand mark, nav links, ⌘K search trigger, and "Get started" CTA; `Footer.astro` rewritten with four-column layout; `fonts.css` wired up Geist/Inter/Geist Mono.

**Phase 03 — Landing rewrite:** `NeonStreaks.astro` added (4 blurred streaks, `aria-hidden`, respects `prefers-reduced-motion`); `index.astro` rewritten into 5 sections with fluid `clamp()`-based typography and responsive breakpoints at 960 px and 640 px; SoftwareApplication JSON-LD preserved.

**Phase 04 — Docs reskin:** `Sidebar.astro`, `Breadcrumb.astro`, and `DocPage.astro` restyled to new tokens; `doc-shell` CSS grid layout introduced; `.doc-article` typography block added; all six legacy alias tokens removed with zero remaining references.

**Phase 05 — Mobile nav + QA:** `@media (max-width: 768px)` rule added to `Header.astro` hiding `.nav-links` and `.search-trigger__label`, narrowing header gap for mobile viewports (hamburger menu deferred as out of scope). Full QA suite passed: clean build, 30+ docs pages render above floor threshold, JSON-LD intact (SoftwareApplication, WebSite, TechArticle, BreadcrumbList), Pagefind index built, sitemap and `llms-full.txt` unchanged.

## Related Pages

- [[wiki-maintainer]] — the wiki vault that this site renders
- [[plugin-system]] — plugin architecture that generates the wiki content
- [[gd-wiki-vault-adoption]] — decision to use .gd-wiki/ as canonical docs store
