// Usage counts for the site's ⌘K palette (assets/js/palette.js), so whether it
// earns more work can be decided from numbers rather than guessed. Cloudflare
// Web Analytics sees page views only; it cannot tell a palette open from
// nothing at all.
//
// Written to Workers Analytics Engine, not KV. KV's free plan allows 1,000
// writes a day, shared with the chat meter, and a read-modify-write counter
// there drops increments under concurrency. Analytics Engine is append-only,
// free for 100,000 data points a day, keeps three months, and is queried with
// SQL (see scripts/palette-stats.sh).
//
// What is recorded is deliberately narrow. Never anything the visitor typed:
// a question sent to the chatbot is counted, its text is not (AI Gateway
// already logs chat, under the disclosure in the dock). Never an IP, a user
// agent, or anything that ties two events to one person. Item names are site
// content (page and action titles), not visitor input, and are length-capped
// here regardless, since the body is only as trustworthy as whoever sent it.

import { ALLOWED_ORIGINS } from "./chat";

export interface PaletteEnv {
  PALETTE_EVENTS?: AnalyticsEngineDataset;
}

// Every field is an allowlist, so a forged beacon can skew a count but cannot
// write free text into the dataset beyond the capped item and path.
const EVENTS = new Set(["open", "pick", "ask", "dismiss", "handoff"]);
const VIA = new Set(["shortcut", "slash", "button", ""]);
const KINDS = new Set(["page", "section", "action", "link", ""]);
const ASK_SOURCES = new Set(["row", "starter", "input", ""]);

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 1000)) : 0;
}

// Sent with navigator.sendBeacon, which cannot read a response and posts as
// text/plain so there is no preflight. So this returns 204 for everything it
// accepts or ignores alike, and the only CORS concern is the Origin check.
export async function handlePaletteEvent(request: Request, env: PaletteEnv): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(await request.text());
    if (!parsed || typeof parsed !== "object") throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const event = str(body.event, 16);
  const via = str(body.via, 16);
  const kind = str(body.kind, 16);
  const source = str(body.source, 16);
  if (!EVENTS.has(event) || !VIA.has(via) || !KINDS.has(kind) || !ASK_SOURCES.has(source)) {
    return new Response(null, { status: 400 });
  }

  const path = str(body.path, 80);

  // Unbound (a local run without the dataset, or a deploy that dropped it)
  // means counting stops; the site never notices, which is the right failure
  // for a statistic.
  env.PALETTE_EVENTS?.writeDataPoint({
    indexes: [event],
    // Order is the schema; scripts/palette-stats.sh reads them by position.
    blobs: [
      event,                                   // blob1
      via,                                     // blob2: how it was opened
      kind,                                    // blob3: what kind of row was picked
      kind ? str(body.item, 80) : "",          // blob4: which one, site content only
      source,                                  // blob5: how a question was sent
      path.startsWith("/") ? path : "",        // blob6: the page it happened on
      body.queried === true ? "yes" : "no",    // blob7: had anything been typed
    ],
    doubles: [
      num(body.rank),                          // double1: position of the picked row
    ],
  });

  return new Response(null, { status: 204 });
}
