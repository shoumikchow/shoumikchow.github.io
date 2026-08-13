// Serves the Markdown homepage to terminal clients (`curl shoumikchow.com`)
// and the normal HTML page to everything else. The .md files are already
// published by Jekyll, so there is no conversion to do here — just pick one.

const TERMINAL = /\b(curl|wget|httpie|lwp-request)\b/i;

export default {
  async fetch(request: Request): Promise<Response> {
    const wantsText =
      TERMINAL.test(request.headers.get("user-agent") ?? "") ||
      /text\/(markdown|plain)/.test(request.headers.get("accept") ?? "");

    if (!wantsText) return fetch(request);

    try {
      const url = new URL(request.url);
      // "/" -> /index.md, "/about" (or "/about/") -> /about.md
      const page = url.pathname === "/" ? "/index" : url.pathname.replace(/\/$/, "");
      const md = await fetch(`${url.origin}${page}.md`, {
        // Route is root-only so this cannot loop, but a non-terminal UA on the
        // subrequest keeps that true even if the route is widened later.
        headers: { "user-agent": "shoumikchow-terminal-worker" },
      });
      if (!md.ok) return fetch(request);

      return new Response(await md.text(), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    } catch {
      // ponytail: every failure path degrades to the normal HTML page rather
      // than erroring. A broken worker should never take the homepage down.
      return fetch(request);
    }
  },
};
