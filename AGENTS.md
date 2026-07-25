# Repository instructions

## SEO changes

For any request to update, improve, audit, or rewrite site SEO:

1. Read `docs/SEO_SYSTEM.md`.
2. Treat `seo/seo.config.json` as the only hand-edited source of truth for public page SEO.
3. Audit the current route definitions and visible page copy before changing metadata.
4. Keep business facts consistent with the app. Nolan's Knives is based in Huntsville, Alabama. Never invent addresses, phone numbers, hours, credentials, awards, reviews, guarantees, capabilities, or service areas.
5. Keep private workflow routes out of search results.
6. Preserve canonical lowercase public URLs and old-link redirects.
7. Do not add meta keywords, keyword stuffing, fake location pages, fake FAQ content, or unsupported structured data.
8. Do not add Product or Offer structured data for knives; use ItemPage for individual knife pages.
9. Run `npm run seo:update`, `npm run build`, and `npm test -- --watchAll=false`. Fix failures before handing the project back.
10. Never edit generated SEO artifacts without updating the configuration or generator that owns them.

When a new public route is added, add it to `seo/seo.config.json` in the same change. When a route becomes private, add its pattern to `noindexPatterns` and remove it from the sitemap.
