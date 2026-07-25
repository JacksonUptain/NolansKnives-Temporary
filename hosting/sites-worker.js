export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return response;
    }

    const url = new URL(request.url);
    const lastPathSegment = url.pathname.split("/").pop() || "";
    if (lastPathSegment.includes(".")) {
      return response;
    }

    const routeCandidates = [
      `${url.pathname.replace(/\/$/, "")}.html`,
      `${url.pathname.replace(/\/$/, "")}/index.html`,
    ];

    for (const candidate of routeCandidates) {
      const routeUrl = new URL(url);
      routeUrl.pathname = candidate;
      const routeResponse = await env.ASSETS.fetch(new Request(routeUrl, request));
      if (routeResponse.status !== 404) {
        return routeResponse;
      }
    }

    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
