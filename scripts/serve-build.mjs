import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { projectRoot } from "./seo-lib.mjs";

const buildDirectory = path.join(projectRoot, "build");
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function resolveRequestFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath).replaceAll("\\", "/");
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidates = relativePath
    ? path.extname(relativePath)
      ? [relativePath]
      : [`${relativePath}.html`, `${relativePath}/index.html`, "index.html"]
    : ["index.html"];

  return candidates
    .map((candidate) => path.resolve(buildDirectory, candidate))
    .find(
      (candidate) =>
        candidate.startsWith(`${buildDirectory}${path.sep}`)
        && fs.existsSync(candidate)
        && fs.statSync(candidate).isFile(),
    );
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const filePath = resolveRequestFile(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Production preview: http://127.0.0.1:${port}`);
});
