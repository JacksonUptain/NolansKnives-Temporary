import fs from "node:fs";
import path from "node:path";
import {
  loadSeoConfig,
  projectRoot,
  renderLlms,
  renderRobots,
  renderSeoHead,
  renderSitemap,
  replaceSeoBlock,
  validateSeoConfig,
} from "./seo-lib.mjs";

const config = loadSeoConfig();
const { errors, warnings } = validateSeoConfig(config);

if (errors.length) {
  throw new Error(`SEO configuration is invalid:\n- ${errors.join("\n- ")}`);
}

const publicDirectory = path.join(projectRoot, "public");
const sourceSeoDirectory = path.join(projectRoot, "src", "seo");
const indexPath = path.join(publicDirectory, "index.html");
const homePage = config.pages.find((page) => page.id === "home");
const generatedConfig = {
  generatedFrom: "seo/seo.config.json",
  ...config,
};

fs.mkdirSync(sourceSeoDirectory, { recursive: true });
fs.writeFileSync(
  path.join(sourceSeoDirectory, "seo.generated.json"),
  `${JSON.stringify(generatedConfig, null, 2)}\n`,
);
fs.writeFileSync(path.join(publicDirectory, "sitemap.xml"), renderSitemap(config));
fs.writeFileSync(path.join(publicDirectory, "robots.txt"), renderRobots(config));
fs.writeFileSync(path.join(publicDirectory, "llms.txt"), renderLlms(config));
fs.writeFileSync(
  path.join(publicDirectory, "seo-manifest.json"),
  `${JSON.stringify(generatedConfig, null, 2)}\n`,
);

const indexHtml = fs.readFileSync(indexPath, "utf8");
fs.writeFileSync(indexPath, replaceSeoBlock(indexHtml, renderSeoHead(config, homePage)));

console.log(`Generated SEO files for ${config.pages.length} route definitions.`);
for (const warning of warnings) {
  console.warn(`SEO warning: ${warning}`);
}
