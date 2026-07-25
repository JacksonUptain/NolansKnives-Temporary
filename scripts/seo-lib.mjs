import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptsDirectory, "..");
export const configPath = path.join(projectRoot, "seo", "seo.config.json");

export function loadSeoConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

export function absoluteUrl(baseUrl, value = "/") {
  return new URL(value, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function getStaticPages(config) {
  return config.pages.filter((page) => page.path);
}

export function buildOrganization(config) {
  const { site } = config;
  return {
    "@type": "Organization",
    "@id": `${site.baseUrl}/#organization`,
    name: site.name,
    url: `${site.baseUrl}/`,
    email: site.email,
    description: site.description,
    areaServed: {
      "@type": "City",
      name: `${site.location.city}, ${site.location.region}`,
    },
  };
}

export function buildPageGraph(config, page, options = {}) {
  const { site } = config;
  const pathName = options.path || page.path || "/";
  const canonical = absoluteUrl(site.baseUrl, pathName);
  const image = absoluteUrl(site.baseUrl, options.image || site.defaultImage);
  const pageId = `${canonical}#webpage`;
  const graph = [
    buildOrganization(config),
    {
      "@type": "WebSite",
      "@id": `${site.baseUrl}/#website`,
      url: `${site.baseUrl}/`,
      name: site.name,
      description: site.description,
      publisher: { "@id": `${site.baseUrl}/#organization` },
      inLanguage: site.language,
    },
    {
      "@type": options.schemaType || page.schemaType || "WebPage",
      "@id": pageId,
      url: canonical,
      name: options.title || page.title,
      description: options.description || page.description,
      isPartOf: { "@id": `${site.baseUrl}/#website` },
      about: { "@id": `${site.baseUrl}/#organization` },
      inLanguage: site.language,
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: image,
      },
    },
  ];

  if (pathName !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${site.baseUrl}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: options.breadcrumbName || (options.title || page.title).split("|")[0].trim(),
          item: canonical,
        },
      ],
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function renderSeoHead(config, page, options = {}) {
  const { site } = config;
  const pathName = options.path || page.path || "/";
  const title = options.title || page.title;
  const description = options.description || page.description;
  const canonical = absoluteUrl(site.baseUrl, pathName);
  const image = absoluteUrl(site.baseUrl, options.image || site.defaultImage);
  const imageAlt = options.imageAlt || site.defaultImageAlt;
  const robots = (options.index ?? page.index)
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "noindex,nofollow";
  const graph = buildPageGraph(config, page, options);

  return [
    `    <title>${escapeHtml(title)}</title>`,
    `    <meta name="description" content="${escapeHtml(description)}" />`,
    `    <meta name="robots" content="${robots}" />`,
    `    <link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `    <link rel="alternate" hreflang="${escapeHtml(site.language)}" href="${escapeHtml(canonical)}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />`,
    `    <meta property="og:site_name" content="${escapeHtml(site.name)}" />`,
    `    <meta property="og:locale" content="${escapeHtml(site.locale)}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `    <meta property="og:title" content="${escapeHtml(title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(description)}" />`,
    `    <meta property="og:image" content="${escapeHtml(image)}" />`,
    `    <meta property="og:image:width" content="${site.defaultImageWidth}" />`,
    `    <meta property="og:image:height" content="${site.defaultImageHeight}" />`,
    `    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />`,
    `    <script type="application/ld+json" data-seo-schema="true">${safeJson(graph)}</script>`,
  ].join("\n");
}

export function renderSitemap(config) {
  const rows = getStaticPages(config)
    .filter((page) => page.index && page.sitemap.include)
    .map((page) => {
      const changeFrequency = page.sitemap.changeFrequency
        ? `\n    <changefreq>${page.sitemap.changeFrequency}</changefreq>`
        : "";
      const priority = Number.isFinite(page.sitemap.priority)
        ? `\n    <priority>${page.sitemap.priority.toFixed(1)}</priority>`
        : "";
      return `  <url>\n    <loc>${absoluteUrl(config.site.baseUrl, page.path)}</loc>${changeFrequency}${priority}\n  </url>`;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

export function renderRobots(config) {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl(config.site.baseUrl, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

export function renderLlms(config) {
  const indexedPages = getStaticPages(config).filter((page) => page.index);
  return [
    `# ${config.site.name}`,
    "",
    `> ${config.site.description}`,
    "",
    "Nolan's Knives is based in Huntsville, Alabama. The public site shows available knives, past work, the custom request process, and customer contact options.",
    "",
    "## Public pages",
    "",
    ...indexedPages.map(
      (page) => `- [${page.title}](${absoluteUrl(config.site.baseUrl, page.path)}): ${page.description}`,
    ),
    "",
    "## Important factual notes",
    "",
    "- Location: Huntsville, Alabama, United States.",
    "- Custom projects begin with a request and quote; accepted custom builds use a 15% deposit before work is scheduled.",
    "- Account, checkout, customer order, and business workspace pages are private workflow pages and are not intended for search indexing.",
    "",
  ].join("\n");
}

export function validateSeoConfig(config) {
  const errors = [];
  const warnings = [];
  const titleOwners = new Map();
  const descriptionOwners = new Map();
  const pathOwners = new Map();
  const idOwners = new Set();

  const addDuplicate = (map, value, id, label) => {
    if (map.has(value)) {
      errors.push(`${label} is duplicated by "${map.get(value)}" and "${id}".`);
    } else {
      map.set(value, id);
    }
  };

  if (!Number.isInteger(config.version) || config.version < 1) {
    errors.push("version must be a positive integer.");
  }
  if (!config.site?.baseUrl?.startsWith("https://")) {
    errors.push("site.baseUrl must use HTTPS.");
  }
  if (config.site?.baseUrl?.endsWith("/")) {
    errors.push("site.baseUrl must not end with a slash.");
  }
  if (config.site?.location?.city !== "Huntsville" || config.site?.location?.region !== "Alabama") {
    errors.push("The verified business location must remain Huntsville, Alabama.");
  }
  if (!Array.isArray(config.pages) || config.pages.length === 0) {
    errors.push("pages must contain at least one public page.");
  }

  for (const page of config.pages || []) {
    if (!page.id || idOwners.has(page.id)) {
      errors.push(`Page id "${page.id || "(missing)"}" is missing or duplicated.`);
    }
    idOwners.add(page.id);

    if (Boolean(page.path) === Boolean(page.pathPattern)) {
      errors.push(`Page "${page.id}" must have exactly one path or pathPattern.`);
    }
    if (page.path) {
      addDuplicate(pathOwners, page.path, page.id, `Path "${page.path}"`);
      if (page.path !== "/" && (page.path !== page.path.toLowerCase() || page.path.endsWith("/"))) {
        errors.push(`Page "${page.id}" must use a lowercase path without a trailing slash.`);
      }
    }

    addDuplicate(titleOwners, page.title, page.id, `Title "${page.title}"`);
    addDuplicate(descriptionOwners, page.description, page.id, `Description for "${page.id}"`);

    if (page.title.length < 28 || page.title.length > 65) {
      warnings.push(`Title for "${page.id}" is ${page.title.length} characters; review it for clarity in search results.`);
    }
    if (page.description.length < 110 || page.description.length > 180) {
      warnings.push(`Description for "${page.id}" is ${page.description.length} characters; review it for usefulness.`);
    }
    if (page.sitemap?.include && (!page.path || !page.index)) {
      errors.push(`Page "${page.id}" can only enter the sitemap when it has a static path and is indexable.`);
    }
    if (
      page.sitemap?.priority !== undefined
      && (page.sitemap.priority < 0 || page.sitemap.priority > 1)
    ) {
      errors.push(`Sitemap priority for "${page.id}" must be between 0 and 1.`);
    }
    if (/keyword/i.test(Object.keys(page).join(" "))) {
      errors.push(`Page "${page.id}" contains a meta-keyword field; Google ignores meta keywords.`);
    }
  }

  const canonicalPaths = new Set(getStaticPages(config).map((page) => page.path));
  for (const alias of config.aliases || []) {
    if (!canonicalPaths.has(alias.to)) {
      errors.push(`Alias "${alias.from}" points to unknown canonical path "${alias.to}".`);
    }
    if (alias.from === alias.to) {
      errors.push(`Alias "${alias.from}" cannot point to itself.`);
    }
  }

  return { errors, warnings };
}

export function replaceSeoBlock(html, head) {
  const commentPattern = /[ \t]*<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;
  const elementPattern = /[ \t]*<meta[^>]*data-seo-boundary=["']start["'][^>]*>[\s\S]*?<meta[^>]*data-seo-boundary=["']end["'][^>]*>/;
  const pattern = commentPattern.test(html) ? commentPattern : elementPattern;
  const block = [
    '    <meta data-seo-boundary="start" />',
    head,
    '    <meta data-seo-boundary="end" />',
  ].join("\n");

  if (!pattern.test(html)) {
    throw new Error("SEO marker block is missing from public/index.html.");
  }
  return html.replace(pattern, block);
}
