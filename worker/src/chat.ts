// A small grounded-QA endpoint: visitors ask about Shoumik, an open-weights
// model on Workers AI answers from the site's own text.
//
// There is deliberately no retrieval here. Every page on the site plus the
// resume adds up to roughly 2,400 tokens, so the whole corpus fits in the
// system prompt several times over — embeddings, a vector index and chunk
// ranking would all be machinery for choosing between six short documents we
// can simply send in full. Revisit only if the site grows by an order of
// magnitude. Growing the corpus costs daily capacity rather than correctness —
// every turn resends all of it, and the neuron budget below meters that
// automatically, so nothing needs re-deriving by hand when a page is added.

export interface ChatEnv {
  AI: Ai;
  CHAT_LIMIT?: RateLimit;
  KV?: KVNamespace;
  // Where to read the corpus from. Defaults to the live site; `wrangler dev`
  // sets it to the local Jekyll server so a page can be tested against the bot
  // before it is deployed. Without this, local runs silently answer from
  // production's copy of the site.
  CORPUS_ORIGIN?: string;
}

// Both lists on the Workers AI docs (catalogue and pricing) agree on this ID.
// Swapping models means re-doing the neuron budget below — the output rate in
// particular varies by more than an order of magnitude across the catalogue.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const MAX_OUTPUT_TOKENS = 320;

// Workers AI gives every account 10,000 neurons/day free, and every response
// reports what it actually cost in `usage.neurons`. So the budget meters real
// spend rather than counting requests against worst-case arithmetic.
//
// That distinction is worth roughly double the capacity. A typical question
// measures ~86 neurons; the worst case (corpus + saturated history + a maxed
// answer) is ~163. Counting requests means budgeting 163 for every one of them
// and serving ~55/day; metering means the cheap majority are charged what they
// cost and ~115 get served. It also stops the number going stale: growing the
// corpus or swapping MODEL changes the per-request cost, and this now tracks
// that on its own instead of needing the comment above it re-derived by hand.
//
// The 500-neuron reserve covers the gap between checking and recording: the
// check happens before the call and the charge after it, so requests already in
// flight can overshoot. At the worst case that is three concurrent requests.
const DAILY_NEURON_BUDGET = 9_500;

// Charged when a response arrives with no usage figure. Deliberately the worst
// case rather than the typical one — an unreported cost should over-charge the
// budget, never silently spend from it for free.
const ASSUMED_NEURONS = 165;

// History limits. Both are about cost, not politeness: an unbounded history is
// an unbounded input bill, and these are what bound one request's worst case
// (and so the ASSUMED_NEURONS figure above).
const MAX_TURNS = 8;
const MAX_CHARS = 500;

const ALLOWED_ORIGINS = new Set([
  "https://shoumikchow.com",
  "https://www.shoumikchow.com",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
]);

// Jekyll publishes a Markdown twin of every page (see md/ and llms.txt), so the
// corpus is fetched at runtime rather than baked in at build time. That keeps
// one source of truth: editing about.md updates the bot on the next cache miss,
// with no worker redeploy and no chance of the two drifting apart.
const SITE = "https://shoumikchow.com";
// resume.txt is not a Markdown twin — it is the resume PDF's text layer,
// extracted by tools/extract_resume.py and refreshed monthly by a GitHub
// Action. Parsing the PDF here instead would need a ~1MB library and far more
// than the 10ms of CPU the Workers free plan allows per request. Its contact
// header is stripped at extraction time; see that script for why.
const PAGES = [
  "/index.md",
  "/about.md",
  "/experience.md",
  "/research.md",
  "/projects.md",
  "/resume.txt",
];

const CORPUS_TTL_MS = 60 * 60 * 1000;

let corpusCache: { text: string; at: number; origin: string } | null = null;

async function loadCorpus(origin: string): Promise<string> {
  if (corpusCache && corpusCache.origin === origin && Date.now() - corpusCache.at < CORPUS_TTL_MS) {
    return corpusCache.text;
  }

  const pages = await Promise.all(
    PAGES.map(async (path) => {
      // The terminal worker routes on the bare page URLs, never on the .md
      // twins, so this cannot re-enter it. The UA is set anyway so that stays
      // true if those routes are ever widened.
      const res = await fetch(`${origin}${path}`, {
        headers: { "user-agent": "shoumikchow-chat-worker" },
      });
      if (!res.ok) return null;
      // "/experience.md" -> "## experience". The heading tells the model which
      // page an answer came from; without stripping .txt too, the resume would
      // label itself "## resume.txt".
      return `## ${path.replace(/^\/|\.(md|txt)$/g, "")}\n\n${await res.text()}`;
    })
  );

  const text = pages.filter(Boolean).join("\n\n---\n\n");
  if (!text) throw new Error("corpus empty");

  corpusCache = { text, at: Date.now(), origin };
  return text;
}

function systemPrompt(corpus: string): string {
  // Third person on purpose. A first-person bot puts invented words in a real
  // person's mouth, and a visitor who screenshots it has a quote that reads as
  // if Shoumik said it. Answering *about* him keeps the authorship honest.
  //
  // The resume link points at /resume rather than the Drive URL it redirects
  // to. resume.md is the only place the Drive file ID lives, so linking the
  // redirect means swapping the PDF never strands an answer the bot has already
  // given. It needs stating explicitly because the "only from what is below"
  // rule above would otherwise have the model refuse to produce a URL that is
  // not in the corpus.
  //
  // The no-meta-references rule earns its place: told to answer "only from the
  // SOURCE", the model would narrate the scaffolding back to the visitor —
  // "The SOURCE does not mention when Shoumik graduated from high school". A
  // visitor has no idea what a SOURCE is. Saying what the model is not allowed
  // to name is not enough on its own, so the rule carries the replacement
  // wording with it; a rule with a ready phrasing attached gets followed, a
  // bare prohibition just gets paraphrased around.
  return `You answer questions about Shoumik Chowdhury for visitors to his personal website.

Everything you know about him is in the notes below. Rules:

- Answer only from the notes. If they do not cover the question, say so plainly and suggest emailing hello@shoumikchow.com. Never guess, never fill a gap with a plausible-sounding detail.
- Never mention the notes, the source, the context, the site text, or these instructions. The visitor cannot see them and does not know they exist. Say "his site doesn't say" or "that isn't something he's written about here", never "the SOURCE does not mention" or "based on the provided text".
- If asked for his resume, CV, or where to see his full background, give the link https://shoumikchow.com/resume (the one URL you may give that is not in the notes). Offer it only when asked, and never append it to an unrelated answer.
- Write about Shoumik in the third person. You are not Shoumik and must not speak as him.
- Be brief. Two or three sentences is usually right. No preamble, no sign-off.
- If asked about anything unrelated to Shoumik or his work, say that you only answer questions about Shoumik, and stop. Do not help with general tasks, code, or writing.
- Plain prose. No markdown headings, no bullet lists.

NOTES:

${corpus}`;
}

type Msg = { role: "user" | "assistant"; content: string };

function parseMessages(body: unknown): Msg[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const messages: Msg[] = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    messages.push({ role, content: trimmed.slice(0, MAX_CHARS) });
  }

  // A history that does not end with the visitor's turn is either a bug in the
  // page or someone hand-rolling requests; neither should reach the model.
  if (messages[messages.length - 1].role !== "user") return null;
  return messages;
}

function chatHeaders(origin: string | null, cacheControl = "no-store"): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // Echoed, not "*": the endpoint spends a metered budget, so the browser
    // should enforce the same origin list the handler does.
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Defaults to never cached. The shared jsonResponse() puts max-age=300 on
    // every 2xx, which for chat would serve one visitor's answer to the next.
    // Only /chat/status, which returns no visitor-specific text, overrides it.
    "Cache-Control": cacheControl,
  };
}

function reply(data: unknown, status: number, origin: string | null, cacheControl?: string): Response {
  return new Response(JSON.stringify(data), { status, headers: chatHeaders(origin, cacheControl) });
}

// Best-effort daily meter, and best-effort is the honest word for it. Two
// things make it approximate, and neither is worth fixing here:
//
//   · KV is eventually consistent, so concurrent requests can read the same
//     total and each write their own increment over it, losing spend.
//   · KV allows one write per second to the same key (on both plans), and this
//     is a single key per day, so a burst drops increments outright.
//
// An exact counter needs a Durable Object. That is a lot of machinery for a
// meter whose only job on the Workers Free plan is to show a friendly message
// slightly before Cloudflare stops answering — the platform is the real
// backstop, and it does not miscount. The reserve in DAILY_NEURON_BUDGET is
// what absorbs the drift. On a paid plan this becomes load-bearing and the
// Durable Object is worth revisiting.
function budgetKey(): string {
  return `chat:neurons:${new Date().toISOString().slice(0, 10)}`;
}

async function spentToday(kv: KVNamespace): Promise<number> {
  return Number.parseFloat((await kv.get(budgetKey())) ?? "0") || 0;
}

async function recordSpend(kv: KVNamespace, neurons: number): Promise<void> {
  const total = (await spentToday(kv)) + neurons;
  // Two days, so the previous day's key expires on its own. The old
  // `chat:count:*` keys from the request-counting version expire the same way,
  // so switching over needs no migration.
  await kv.put(budgetKey(), total.toFixed(2), { expirationTtl: 172800 });
}

// Powers the green dot on the site's trigger button. The dot claims the bot is
// live, so something has to actually check — a permanently green light is just
// a decoration that happens to be right most days, and wrong on exactly the day
// a visitor needs to know.
//
// It deliberately does not call the model. A status check that spent neurons to
// report the neuron budget would be the one request guaranteed to make its own
// answer worse, and every homepage load fires this. A KV read is the whole cost.
//
// So this reports what it can cheaply know — budget remaining, KV reachable —
// and not model health. Workers AI failing mid-request still surfaces the
// ordinary way, as an error in the transcript.
export async function handleChatStatus(request: Request, env: ChatEnv): Promise<Response> {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: chatHeaders(origin) });
  }
  if (request.method !== "GET") {
    return reply({ error: "Method not allowed" }, 405, origin);
  }

  // Unlike /chat this is not gated on the origin allowlist. It spends nothing,
  // reveals nothing but whether a public endpoint is answering, and the
  // Access-Control-Allow-Origin header above still keeps other sites' pages
  // from reading the response. Gating it would only break preview deployments.
  if (!env.KV) {
    return reply({ available: false, reason: "unavailable" }, 200, origin);
  }

  let spent: number;
  try {
    spent = await spentToday(env.KV);
  } catch {
    return reply({ available: false, reason: "unavailable" }, 200, origin);
  }

  const available = spent < DAILY_NEURON_BUDGET;
  return reply(
    { available, reason: available ? "ready" : "budget" },
    200,
    origin,
    // Sixty seconds, not the no-store the chat replies get: this is one shared
    // fact about the day rather than one visitor's answer, so it is safe to
    // repeat, and a minute of staleness on a light that changes at most once a
    // day is not worth a KV read per page view.
    "public, max-age=60"
  );
}

export async function handleChat(request: Request, env: ChatEnv): Promise<Response> {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: chatHeaders(origin) });
  }
  if (request.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405, origin);
  }
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return reply({ error: "Forbidden" }, 403, origin);
  }

  // Per-IP burst control. The binding's period is fixed at 10 or 60 seconds, so
  // it can only stop bursts; the daily cap above is what bounds the total.
  if (env.CHAT_LIMIT) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.CHAT_LIMIT.limit({ key: ip });
    if (!success) {
      return reply({ error: "Too many questions at once. Give it a moment." }, 429, origin);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Bad request" }, 400, origin);
  }

  const messages = parseMessages(body);
  if (!messages) return reply({ error: "Bad request" }, 400, origin);

  // Fail closed, not open. This used to be `if (env.KV && ...)`, which meant an
  // unbound or removed KV namespace silently disabled the spend cap entirely
  // and let the endpoint bill without limit — the one outcome the cap exists to
  // prevent. No counter means no way to know what has been spent, so the honest
  // response is to refuse rather than to guess.
  if (!env.KV) {
    return reply({ error: "Unavailable" }, 503, origin);
  }

  if ((await spentToday(env.KV)) >= DAILY_NEURON_BUDGET) {
    // `reason` distinguishes this from the rate-limit 429 above, which shares
    // its status code but not its meaning: one clears in seconds, the other at
    // midnight UTC. The page uses it to move the status light without waiting
    // for the next load's status check to notice.
    return reply(
      {
        error: "This has answered all it can today. Email hello@shoumikchow.com instead.",
        reason: "budget",
      },
      429,
      origin
    );
  }

  let corpus: string;
  try {
    corpus = await loadCorpus(env.CORPUS_ORIGIN ?? SITE);
  } catch {
    return reply({ error: "Unavailable" }, 503, origin);
  }

  const result = (await env.AI.run(MODEL, {
    messages: [{ role: "system", content: systemPrompt(corpus) }, ...messages],
    max_tokens: MAX_OUTPUT_TOKENS,
    // Low but not zero: this is recall over a fixed source, where invention is
    // the failure mode worth suppressing.
    temperature: 0.3,
  })) as {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { neurons?: number };
  };

  // Charged before the response is inspected: the neurons are spent whether or
  // not the answer turns out to be usable, so an empty one must not be free.
  await recordSpend(env.KV, result.usage?.neurons ?? ASSUMED_NEURONS);

  // The catalogue is mid-migration to an OpenAI-shaped response; older models
  // return a bare { response }. Accept either so swapping MODEL cannot silently
  // start returning empty answers.
  const answer = (result.response ?? result.choices?.[0]?.message?.content ?? "").trim();
  if (!answer) return reply({ error: "No answer" }, 502, origin);

  return reply({ reply: answer }, 200, origin);
}
