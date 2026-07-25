import fs from "node:fs";
import path from "node:path";
import {
  loadSeoConfig,
  projectRoot,
  renderRobots,
  renderSitemap,
  validateSeoConfig,
} from "./seo-lib.mjs";

const config = loadSeoConfig();
const { errors, warnings } = validateSeoConfig(config);
const expectedFiles = [
  ["public/sitemap.xml", renderSitemap(config)],
  ["public/robots.txt", renderRobots(config)],
  ["src/seo/seo.generated.json", null],
  ["public/seo-manifest.json", null],
  ["public/llms.txt", null],
];

for (const [relativePath, expectedContent] of expectedFiles) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`${relativePath} has not been generated. Run npm run seo:generate.`);
    continue;
  }
  if (expectedContent !== null && fs.readFileSync(filePath, "utf8") !== expectedContent) {
    errors.push(`${relativePath} is out of date. Run npm run seo:generate.`);
  }
}

const publicIndex = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
if (
  !publicIndex.includes('data-seo-boundary="start"')
  || !publicIndex.includes('data-seo-schema="true"')
) {
  errors.push("public/index.html is missing its generated SEO head.");
}

if (errors.length) {
  console.error(`SEO check failed:\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`SEO check passed for ${config.pages.length} route definitions.`);
}

for (const warning of warnings) {
  console.warn(`SEO warning: ${warning}`);
}
