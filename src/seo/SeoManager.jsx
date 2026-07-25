import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import seoConfig from "./seo.generated.json";

const SeoOverrideContext = createContext(() => {});

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

function matchesPattern(pathname, pattern) {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  return (
    pathParts.length === patternParts.length
    && patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index])
  );
}

function toAbsoluteUrl(value) {
  return new URL(value || "/", `${seoConfig.site.baseUrl}/`).toString();
}

function upsertMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertLink(rel, href, hreflang) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    if (hreflang) element.setAttribute("hreflang", hreflang);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

function buildSchema(page, details) {
  const { site } = seoConfig;
  const canonical = details.canonical;
  const organizationId = `${site.baseUrl}/#organization`;
  const websiteId = `${site.baseUrl}/#website`;
  const graph = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: site.name,
      url: `${site.baseUrl}/`,
      email: site.email,
      description: site.description,
      areaServed: {
        "@type": "City",
        name: `${site.location.city}, ${site.location.region}`,
      },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: `${site.baseUrl}/`,
      name: site.name,
      description: site.description,
      publisher: { "@id": organizationId },
      inLanguage: site.language,
    },
    {
      "@type": details.schemaType || page.schemaType || "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: details.title,
      description: details.description,
      isPartOf: { "@id": websiteId },
      about: { "@id": organizationId },
      inLanguage: site.language,
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: details.image,
      },
    },
  ];

  if (details.path !== "/") {
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
          name: details.breadcrumbName || details.title.split("|")[0].trim(),
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

function resolvePage(pathname) {
  const staticPage = seoConfig.pages.find((page) => page.path === pathname);
  if (staticPage) return staticPage;

  return seoConfig.pages.find(
    (page) => page.pathPattern && matchesPattern(pathname, page.pathPattern),
  );
}

function isPrivatePath(pathname) {
  return seoConfig.noindexPatterns.some((pattern) => matchesPattern(pathname, pattern));
}

function getPrivatePageTitle(pathname) {
  const labels = [
    ["/account", "Account"],
    ["/checkout", "Checkout"],
    ["/my-account", "My Account"],
    ["/my-knives", "Your Knives"],
    ["/custom-knife/confirmation", "Custom Request Received"],
    ["/business", "Business Workspace"],
    ["/admin", "Admin Dashboard"],
    ["/unauthorized", "Access Required"],
  ];
  const match = labels.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? `${match[1]} | ${seoConfig.site.name}` : `Private Page | ${seoConfig.site.name}`;
}

export function useSeoOverride(value) {
  const setOverride = useContext(SeoOverrideContext);
  const serializedValue = JSON.stringify(value || null);

  useEffect(() => {
    setOverride(serializedValue ? JSON.parse(serializedValue) : null);
    return () => setOverride(null);
  }, [serializedValue, setOverride]);
}

function SeoManager({ children }) {
  const location = useLocation();
  const pathname = normalizePath(location.pathname);
  const [overrideState, setOverrideState] = useState(null);

  const setOverride = useCallback(
    (value) => setOverrideState(value ? { pathname, value } : null),
    [pathname],
  );

  const page = resolvePage(pathname);
  const routeOverride = overrideState?.pathname === pathname ? overrideState.value : null;

  const details = useMemo(() => {
    const privatePath = isPrivatePath(pathname);
    const fallbackPage = {
      title: privatePath
        ? getPrivatePageTitle(pathname)
        : `Page Not Found | ${seoConfig.site.name}`,
      description: seoConfig.site.description,
      schemaType: "WebPage",
      index: false,
    };
    const resolvedPage = page || fallbackPage;
    const index = routeOverride?.index ?? (Boolean(page) && !privatePath && resolvedPage.index);
    const canonicalPath = routeOverride?.canonicalPath || pathname;

    return {
      path: canonicalPath,
      title: routeOverride?.title || resolvedPage.title,
      description: routeOverride?.description || resolvedPage.description,
      image: toAbsoluteUrl(routeOverride?.image || seoConfig.site.defaultImage),
      imageAlt: routeOverride?.imageAlt || seoConfig.site.defaultImageAlt,
      canonical: toAbsoluteUrl(canonicalPath),
      schemaType: routeOverride?.schemaType || resolvedPage.schemaType,
      breadcrumbName: routeOverride?.breadcrumbName,
      index,
    };
  }, [page, pathname, routeOverride]);

  useEffect(() => {
    const { site } = seoConfig;
    const robots = details.index
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,nofollow";

    document.documentElement.lang = site.language;
    document.title = details.title;
    upsertMeta("name", "description", details.description);
    upsertMeta("name", "robots", robots);
    upsertLink("canonical", details.canonical);
    upsertLink("alternate", details.canonical, site.language);
    upsertLink("alternate", details.canonical, "x-default");

    upsertMeta("property", "og:site_name", site.name);
    upsertMeta("property", "og:locale", site.locale);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", details.canonical);
    upsertMeta("property", "og:title", details.title);
    upsertMeta("property", "og:description", details.description);
    upsertMeta("property", "og:image", details.image);
    upsertMeta("property", "og:image:width", String(site.defaultImageWidth));
    upsertMeta("property", "og:image:height", String(site.defaultImageHeight));
    upsertMeta("property", "og:image:alt", details.imageAlt);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", details.title);
    upsertMeta("name", "twitter:description", details.description);
    upsertMeta("name", "twitter:image", details.image);
    upsertMeta("name", "twitter:image:alt", details.imageAlt);

    let schema = document.head.querySelector('script[data-seo-schema="true"]');
    if (!details.index) {
      schema?.remove();
      return;
    }
    if (!schema) {
      schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.dataset.seoSchema = "true";
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify(buildSchema(page, details));
  }, [details, page]);

  return (
    <SeoOverrideContext.Provider value={setOverride}>
      {children}
    </SeoOverrideContext.Provider>
  );
}

export default SeoManager;
