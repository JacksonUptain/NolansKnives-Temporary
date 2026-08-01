import fs from "node:fs";

const config = JSON.parse(fs.readFileSync(new URL("../seo/seo.config.json", import.meta.url), "utf8"));
const baseUrl = config.site.baseUrl.replace(/\/$/, "");
const checks = [
  { path: "/", contains: "Nolan's Knives" },
  { path: "/sitemap.xml", contains: baseUrl },
  { path: "/robots.txt", contains: `${baseUrl}/sitemap.xml` },
];
const attempts = 6;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function verify() {
  const failures = [];

  for (const check of checks) {
    const url = `${baseUrl}${check.path}?deploy_check=${Date.now()}`;

    try {
      const response = await fetch(url, {
        headers: { "cache-control": "no-cache" },
        redirect: "follow",
      });
      const body = await response.text();

      if (!response.ok) {
        failures.push(`${check.path} returned HTTP ${response.status}`);
      } else if (!body.includes(check.contains)) {
        failures.push(`${check.path} did not contain the expected deployed content`);
      }
    } catch (error) {
      failures.push(`${check.path} could not be loaded: ${error.message}`);
    }
  }

  return failures;
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const failures = await verify();

  if (failures.length === 0) {
    console.log(`Post-deploy check passed: ${baseUrl}, sitemap.xml, and robots.txt are live.`);
    process.exit(0);
  }

  if (attempt === attempts) {
    console.error(`Post-deploy check failed after ${attempts} attempts:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }

  console.log(`Deployment is not live yet (attempt ${attempt}/${attempts}); retrying in 5 seconds...`);
  await wait(5000);
}
