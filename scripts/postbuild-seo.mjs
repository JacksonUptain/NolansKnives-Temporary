import fs from "node:fs";
import path from "node:path";
import {
  loadSeoConfig,
  projectRoot,
  renderSeoHead,
  replaceSeoBlock,
  validateSeoConfig,
} from "./seo-lib.mjs";

const config = loadSeoConfig();
const { errors } = validateSeoConfig(config);
if (errors.length) {
  throw new Error(`SEO configuration is invalid:\n- ${errors.join("\n- ")}`);
}

const buildDirectory = path.join(projectRoot, "build");
const buildIndexPath = path.join(buildDirectory, "index.html");
if (!fs.existsSync(buildIndexPath)) {
  throw new Error("build/index.html does not exist. Run the production build first.");
}

const baseHtml = fs.readFileSync(buildIndexPath, "utf8");
const staticPages = config.pages.filter((page) => page.path && page.index);

for (const page of staticPages) {
  const routeHtml = replaceSeoBlock(baseHtml, renderSeoHead(config, page));
  if (page.path === "/") {
    fs.writeFileSync(buildIndexPath, routeHtml);
    continue;
  }

  const routeFile = path.join(buildDirectory, `${page.path.slice(1)}.html`);
  fs.mkdirSync(path.dirname(routeFile), { recursive: true });
  fs.writeFileSync(routeFile, routeHtml);
}

for (const alias of config.aliases) {
  if (alias.from.toLowerCase() === alias.from) {
    const target = new URL(alias.to, config.site.baseUrl).toString();
    const redirectHtml = [
      "<!doctype html>",
      `<html lang="${config.site.language}">`,
      "<head>",
      '  <meta charset="utf-8" />',
      '  <meta name="robots" content="noindex,nofollow" />',
      `  <link rel="canonical" href="${target}" />`,
      `  <meta http-equiv="refresh" content="0;url=${target}" />`,
      "</head>",
      `<body><a href="${target}">Continue</a></body>`,
      "</html>",
      "",
    ].join("\n");
    const aliasFile = alias.from === "/"
      ? buildIndexPath
      : path.join(buildDirectory, `${alias.from.slice(1)}.html`);
    fs.writeFileSync(aliasFile, redirectHtml);
  }
}

console.log(`Added route-specific HTML metadata for ${staticPages.length} public pages.`);
