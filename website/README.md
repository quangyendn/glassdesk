# GlassDesk Website

Astro 5 static site deployed on Vercel. Docs sourced read-only from `../.gd-wiki/`.

## Develop

```sh
nvm use            # node 20+
cd website
npm install
npm run dev        # http://localhost:4321
```

## Build

```sh
npm run build      # → dist/
npm run preview    # serve dist/
```

## Content source

Docs come from `.gd-wiki/` at the repo root via Astro Content Collection (`src/content.config.ts`). This directory is **read-only** from the site — never edited from `website/`.

Wiki-style links (`[[target]]`, `[[target|alias]]`) are resolved by `remark-wiki-link` configured in `astro.config.mjs`.

## Deploy

Vercel auto-deploys on push to `main`. Project settings:

- Root Directory: `website`
- **"Include source files outside of the Root Directory in the Build Step": ENABLED** (required — without this, the `.gd-wiki` glob returns 0 entries)
- Framework preset: Astro (auto-detected)

A floor-assert in `astro.config.mjs` fails the build if the collection has < 5 entries — defensive guard against the toggle being off.

## Local search caveat

Pagefind indexes `dist/` post-build. In `npm run dev` cold (no prior `dist/`), search returns no results. Run `npm run build` once first to generate `dist/pagefind/`.
