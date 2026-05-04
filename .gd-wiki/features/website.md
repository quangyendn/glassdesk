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

> **Design refresh in-progress (Phase 04 shipped)**

`website/src/styles/global.css` now defines a structured CSS token system:
- **Backgrounds:** `--bg-primary/secondary/card/elevated`
- **Borders:** `--border-subtle/strong`
- **Accents:** `--accent-cyan/neon/violet`
- **Text:** `--text-primary/secondary/muted`
- **Layout:** `--maxw-*`, `--radius-*`

Legacy tokens (`--bg`, `--fg`, `--muted`, `--accent`, `--border`, `--code-bg/fg`) were kept as aliases for `/docs/*` pages until Phase 4 (now removed — see below).

### Phase 02 — Header, Footer & Icon system (in-progress)

`Icon.astro` added: accepts a kebab-case `name` prop, resolves to PascalCase, looks up the SVG from `lucide-static`, and renders a fallback span for unknown names.

`Header.astro` rewritten: sticky + backdrop-blur bar with a neon "G" brand mark, four nav links (Docs, Commands, Skills, GitHub), a restyled Search trigger with ⌘K hint, and a neon "Get started" CTA.

`Footer.astro` rewritten: four-column top section (Brand, Product, Docs, Community) containing only resolved links; bottom row carries copyright and a GitHub social icon. No TODO placeholders remain.

`website/src/styles/fonts.css` self-hosts **Geist** (400–700) and **Geist Mono** (400–600) via the `geist` npm package (files in `website/public/fonts/`). **Inter** is loaded from Google Fonts via `Base.astro` (preconnect + `display=swap`). CSS custom properties: `--font-heading` (Geist), `--font-body` (Inter), `--font-mono` (Geist Mono).

### Phase 03 — Landing rewrite

`NeonStreaks.astro` added as a decorative background component: 4 blurred color streaks plus a radial glow, `aria-hidden`, respects `prefers-reduced-motion`.

`index.astro` fully rewritten into 5 sections: Hero (badge, headline, subhead, 6-step pipeline visual, dual CTAs, social proof row), Install (4 cards: fork / marketplace / install / verify, per Q4 spec override), Capabilities (2+3 bento card grid), Documentation (4-card grid linking to architecture, features, decisions, and risks pages), and a closing CTA card.

`pageClass="landing"` and SoftwareApplication JSON-LD schema are preserved; JSON-LD description text updated to mirror the new hero subhead.

`global.css` extended with hero, pipeline, install, bento, docs-grid, and cta-card style blocks; `clamp()`-based fluid typography; responsive breakpoints at 960 px and 640 px.

## Related Pages

- [[wiki-maintainer]] — the wiki vault that this site renders
- [[plugin-system]] — plugin architecture that generates the wiki content
- [[gd-wiki-vault-adoption]] — decision to use .gd-wiki/ as canonical docs store
