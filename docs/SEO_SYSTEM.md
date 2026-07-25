# Nolan's Knives SEO system

The entire public site's SEO is controlled from one file:

`seo/seo.config.json`

That file is the source of truth for page titles, descriptions, canonical URLs, indexing rules, sitemap entries, social previews, and page-level structured data. The generated files should not be edited by hand.

## The one prompt

Paste this into an AI coding session opened at the project root:

> Update the whole site's SEO. Read AGENTS.md and docs/SEO_SYSTEM.md first. Audit the current public routes and visible factual copy, then update the complete SEO system through seo/seo.config.json. Keep Huntsville, Alabama and Nolan's actual business process accurate; do not invent claims, services, credentials, reviews, locations, hours, or contact details. Preserve private-route noindex rules, canonical URL rules, and the structured-data restrictions. Run npm run seo:update, npm run build, and the automated tests. Fix every SEO validation or build failure, then report exactly what changed and flag any factual fields only Nolan can confirm.

That prompt is intentionally broad. The repository instructions tell the AI where the source of truth lives and how to validate the result.

## What happens automatically

Running:

```bash
npm run seo:update
```

validates the configuration and regenerates:

- `public/index.html` SEO head
- `public/sitemap.xml`
- `public/robots.txt`
- `public/seo-manifest.json`
- `public/llms.txt`
- `src/seo/seo.generated.json`

Running:

```bash
npm run build
```

also runs the generator before compilation and creates route-specific HTML files after compilation. This gives each public page useful initial metadata even before JavaScript runs. The app then keeps metadata accurate during client-side navigation. Finished knife pages add their real name and first photo after the database record loads.

## Guardrails

- `/`, `/store`, `/gallery`, `/custom-knife-request`, `/about`, and `/contact` are the canonical public URLs.
- Account, checkout, customer order, confirmation, business, and admin pages remain `noindex`.
- Old `/Home`, `/Store`, and `/Gallery` links redirect to the canonical URLs.
- Do not add `meta keywords`; major search engines do not use them.
- Do not add fake reviews, ratings, awards, availability, service areas, hours, or business details.
- Do not add `Product` or `Offer` rich-result schema for knives. Search-engine product structured-data policies restrict content that promotes weapons. Knife detail pages use factual `ItemPage` markup instead.
- Do not keyword-stuff copy. Titles and descriptions should describe the real page in normal language.
- Do not list dynamic database product URLs in the static sitemap unless the build has a reliable, public product feed and can remove unpublished products promptly.

## Nolan's routine

Nolan does not need to edit tags or XML. He can use the one prompt above whenever the public pages or business process changes. Before publishing, the AI should leave all three commands passing:

```bash
npm run seo:update
npm run build
npm test -- --watchAll=false
```

After the production site is connected, submit `https://nolansknives.com/sitemap.xml` once in Google Search Console. The same sitemap URL updates automatically on later builds.

## Files intended for developers

- `src/seo/SeoManager.jsx` handles client-side route changes and private-page indexing rules.
- `scripts/seo-lib.mjs` contains generation and validation helpers.
- `scripts/generate-seo.mjs` regenerates source and public artifacts.
- `scripts/postbuild-seo.mjs` creates initial HTML metadata for each canonical route.
- `scripts/check-seo.mjs` catches missing, duplicated, invalid, or stale SEO data.
