import { handleChat, handleChatStatus, type ChatEnv } from "./chat";

interface Env extends ChatEnv {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
  TMDB_API_KEY?: string;
  STEAM_API_KEY?: string;
  STEAM_ID?: string;
  KV?: KVNamespace;
}

const LETTERBOXD_USERNAME = "shoumikchow";

const baseHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200): Response {
  const headers: Record<string, string> = { ...baseHeaders };
  if (status >= 200 && status < 300) {
    headers["Cache-Control"] = "public, max-age=300";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractImgSrc(html: string): string | null {
  const match = html.match(/<img\s+src="([^"]+)"/);
  return match ? match[1] : null;
}

async function fetchTmdbDetails(
  title: string,
  year: string | null,
  apiKey: string
): Promise<{ runtime: number | null; genres: string[]; director: string | null }> {
  const query = encodeURIComponent(title);
  const yearParam = year ? `&year=${year}` : "";
  const searchRes = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${query}${yearParam}`
  );

  if (!searchRes.ok) return { runtime: null, genres: [], director: null };

  const searchData: {
    results: Array<{ id: number; genre_ids: number[] }>;
  } = await searchRes.json();

  if (!searchData.results?.length) return { runtime: null, genres: [], director: null };

  const movieId = searchData.results[0].id;

  const detailRes = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&append_to_response=credits`
  );

  if (!detailRes.ok) return { runtime: null, genres: [], director: null };

  const detail: {
    runtime?: number;
    genres?: Array<{ name: string }>;
    credits?: { crew?: Array<{ job: string; name: string }> };
  } = await detailRes.json();

  const director = detail.credits?.crew?.find((c) => c.job === "Director")?.name || null;
  const genres = detail.genres?.map((g) => g.name) || [];

  return { runtime: detail.runtime || null, genres, director };
}

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function handleLetterboxd(env: Env): Promise<Response> {
  const rssUrl = `https://letterboxd.com/${LETTERBOXD_USERNAME}/rss/`;
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "ShoumikChow-Now/1.0" },
  });

  if (!res.ok) {
    return jsonResponse({ error: "Failed to fetch Letterboxd RSS" }, 502);
  }

  const xml = await res.text();

  // Extract first <item> block
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) {
    return jsonResponse({ error: "No entries found" }, 404);
  }

  const item = itemMatch[1];
  const title = extractTag(item, "letterboxd:filmTitle") || extractTag(item, "title") || "";
  const year = extractTag(item, "letterboxd:filmYear");
  const rating = extractTag(item, "letterboxd:memberRating");
  const watchedDate = extractTag(item, "letterboxd:watchedDate");
  const rewatch = extractTag(item, "letterboxd:rewatch");
  const link = extractTag(item, "link");

  // Extract poster from description
  const description = extractTag(item, "description") || "";
  const poster = extractImgSrc(description);

  // Convert rating number to stars
  let stars = "";
  if (rating) {
    const num = parseFloat(rating);
    const fullStars = Math.floor(num);
    const halfStar = num % 1 >= 0.5;
    stars = "\u2605".repeat(fullStars) + (halfStar ? "\u00BD" : "");
  }

  // Enrich with TMDB data if API key is available
  let runtime: string | null = null;
  let genres: string[] = [];
  let director: string | null = null;

  if (env.TMDB_API_KEY) {
    const tmdb = await fetchTmdbDetails(title, year, env.TMDB_API_KEY);
    runtime = tmdb.runtime ? formatRuntime(tmdb.runtime) : null;
    genres = tmdb.genres;
    director = tmdb.director;
  }

  return jsonResponse({
    title,
    year,
    rating: stars || null,
    watchedDate,
    rewatch: rewatch === "Yes",
    link,
    poster,
    runtime,
    genres,
    director,
  });
}

// Open Library is by far the slowest upstream the Now section touches. The
// endpoint this used to call measured a 3.2s median and a 20s tail, with no
// Cache-Control on the response, so neither the browser nor Cloudflare's
// subrequest cache will hold it; its replacements (see fetchBookByISBN) are
// the same service with the same habits. Everything below exists to make
// exactly one visitor per TTL pay that.
const BOOK_TTL = 60 * 60 * 24 * 7;
// Misses get a much shorter TTL: a typo'd ISBN should not pin an empty card for
// a week, but it should not re-pay 3s on every page load either.
const BOOK_MISS_TTL = 60 * 10;
// Guards the Workers subrequest limit — the ISBN list is attacker-controlled
// (it arrives as a query param) and each entry costs one fetch.
const MAX_ISBNS = 10;

interface Book {
  title: string;
  author: string | null;
  pages: number | null;
  publishDate: string | null;
  coverId: string | null;
  link: string;
  isbn: string;
}

// ISBNs are digits with an optional trailing X, sometimes hyphenated. Anything
// else is refused rather than interpolated into the upstream URL.
function isValidIsbn(isbn: string): boolean {
  return /^[0-9-]{9,17}[0-9X]$/i.test(isbn);
}

async function handleBooks(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const isbns = url.searchParams.get("isbns");

  if (!isbns) {
    return jsonResponse({ error: "No ISBNs provided" }, 400);
  }

  const isbnList = isbns
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && isValidIsbn(s))
    .slice(0, MAX_ISBNS);

  const [books, starts] = await Promise.all([
    Promise.all(isbnList.map((isbn) => getBook(isbn, env, ctx))),
    Promise.all(isbnList.map((isbn) => readingSince(isbn, env, ctx))),
  ]);
  const started = new Map(isbnList.map((isbn, i) => [isbn, starts[i]]));

  // The cover id is stored rather than a full URL so the cached copy stays
  // independent of which hostname the worker is answering on.
  const payload = books.filter((b): b is Book => b !== null).map((book) => ({
    title: book.title,
    author: book.author,
    pages: book.pages,
    publishDate: book.publishDate,
    cover: book.coverId ? `${url.origin}/cover?id=${book.coverId}` : null,
    link: book.link,
    isbn: book.isbn,
    started: started.get(book.isbn) ?? null,
  }));

  return jsonResponse(payload);
}

// When a book was started, read from the site's own git history: the date of
// the commit that added its ISBN to _config.yml. There is nothing to keep up
// by hand, and nowhere else it could come from. GitHub Pages builds in safe
// mode, so Jekyll cannot run git or a plugin that does.
//
// Newest to oldest through the commits that touched _config.yml, reading the
// file as it was at each: the start is the oldest commit in the unbroken run
// that still lists the ISBN. Usually one or two raw-file reads. A book that
// was dropped and later re-added dates from the re-adding, which is right.
//
// The commit list comes from GitHub's per-file Atom feed, not the REST API.
// The API allows 60 unauthenticated calls an hour per IP, and Workers share
// egress IPs with everyone else on Cloudflare: the first deploy of this used
// the API and was refused from the edge on its very first call. The feed is a
// page, not an API call, and carries the same commit ids and dates, newest
// first. File reads go to raw.githubusercontent.com, likewise unmetered.
//
// A found date is kept 30 days (it only changes if the book is removed and
// re-added); a failure only an hour, after which it is tried again.
const SITE_REPO = "shoumikchow/shoumikchow.github.io";
const SITE_BRANCH = "master";
const STARTED_TTL = 60 * 60 * 24 * 30;
const STARTED_MISS_TTL = 60 * 60;
const STARTED_MAX_STEPS = 10;

async function readingSince(isbn: string, env: Env, ctx: ExecutionContext): Promise<string | null> {
  const key = `started:${isbn}`;
  // Wrapped, for the same reason as book:<isbn> below: a stored null must be
  // distinguishable from an absent key.
  const cached = await env.KV?.get<{ started: string | null }>(key, "json");
  if (cached) return cached.started;

  const started = await findStart(isbn).catch(() => null);

  ctx.waitUntil(
    env.KV?.put(key, JSON.stringify({ started }), {
      expirationTtl: started ? STARTED_TTL : STARTED_MISS_TTL,
    }) ?? Promise.resolve()
  );
  return started;
}

async function findStart(isbn: string): Promise<string | null> {
  const headers = { "User-Agent": "ShoumikChowNow/1.0 (hello@shoumikchow.com)" };
  const res = await fetch(`https://github.com/${SITE_REPO}/commits/${SITE_BRANCH}/_config.yml.atom`, { headers });
  if (!res.ok) return null;
  const feed = await res.text();

  // Each <entry> carries the commit id in its <id> (…Commit/<sha>) and the
  // commit time in <updated>. A regex is enough for a feed this regular, and
  // Workers have no DOMParser.
  const commits: Array<{ sha: string; date: string }> = [];
  for (const entry of feed.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
    const sha = entry.match(/Commit\/([0-9a-f]{40})/)?.[1];
    const date = entry.match(/<updated>([^<]+)<\/updated>/)?.[1];
    if (sha && date) commits.push({ sha, date });
    if (commits.length >= STARTED_MAX_STEPS) break;
  }

  // Matched on the quoted form, as _config.yml writes it, so a longer ISBN
  // that happens to contain this one as a substring cannot count.
  const needle = `"${isbn}"`;
  let start: string | null = null;
  for (const c of commits) {
    const file = await fetch(`https://raw.githubusercontent.com/${SITE_REPO}/${c.sha}/_config.yml`, { headers });
    if (!file.ok) break;
    if (!(await file.text()).includes(needle)) break;
    start = c.date;
  }
  // Present in every commit looked at means it started earlier still; the
  // oldest seen is a lower bound, and on a site edited this rarely, close.
  return start;
}

async function getBook(isbn: string, env: Env, ctx: ExecutionContext): Promise<Book | null> {
  const key = `book:${isbn}`;

  // Wrapped rather than stored bare, because KV returns null for an absent key
  // and a stored `null` parses to null too. Without the wrapper a cached miss
  // would be indistinguishable from a cache miss, and BOOK_MISS_TTL would never
  // take effect — every load of an unknown ISBN would re-pay the upstream call.
  const cached = await env.KV?.get<{ book: Book | null }>(key, "json");
  if (cached) return cached.book;

  const book = await fetchBookByISBN(isbn);

  // Off the critical path: the visitor already has their answer, and a failed
  // write just means the next request repeats the fetch.
  ctx.waitUntil(
    env.KV?.put(key, JSON.stringify({ book }), {
      expirationTtl: book ? BOOK_TTL : BOOK_MISS_TTL,
    }) ?? Promise.resolve()
  );

  return book;
}

// Two current Open Library endpoints, asked in parallel, because each is
// missing something the other has. This replaced /api/books?jscmd=data, which
// Open Library's docs had marked "a legacy endpoint [that] may be phased out"
// and which began answering 404 for every ISBN in September 2026.
//
//   /isbn/<isbn>.json  The edition itself: the exact title, page count, date
//                      and cover for the printing on the shelf. But editions
//                      often carry no author (this one did not); the author
//                      hangs off the work, one or two more requests away.
//   /search.json       One request with author names attached, but the title
//                      is normalised ("A history of Bangladesh") and the page
//                      count is a median across every edition of the work.
//
// So the edition supplies everything it can and search fills in the author.
// In parallel this costs no more wall time than either alone, and BOOK_TTL
// means Open Library sees it roughly once a week per book.
// Neither source's title is reliably right. The edition's keeps its casing but
// can drop a leading article ("End of Policing" for The End of Policing);
// search's keeps the article but can lowercase the rest ("A history of
// Bangladesh"). So the edition's wins unless search's is that same title with
// the article put back.
function pickTitle(edition: string | undefined, search: string | undefined): string | undefined {
  if (!edition) return search;
  if (!search) return edition;
  const article = search.match(/^(the|a|an)\s+(.*)$/i);
  if (article && article[2].toLowerCase() === edition.toLowerCase()) {
    return `${article[1]} ${edition}`;
  }
  return edition;
}

// Open Library often holds the same person as two author records ("Alex S.
// Vitale" and "Alex Vitale"), and search lists every record on the work. When
// the edition says which records are its authors, only those are named.
// Otherwise names sharing a first and last word are treated as one person,
// the first spelling kept; co-authors with the same first and last name are
// rare enough to accept.
function pickAuthors(
  editionAuthors: Array<{ key?: string }> | undefined,
  doc: { author_name?: string[]; author_key?: string[] } | undefined
): string {
  const names = doc?.author_name ?? [];
  const keys = doc?.author_key ?? [];
  const wanted = new Set((editionAuthors ?? []).map((a) => a.key?.split("/").pop()).filter(Boolean));

  const matched = names.filter((_, i) => wanted.has(keys[i]));
  const candidates = matched.length ? matched : names;

  const seen = new Set<string>();
  return candidates
    .filter((name) => {
      const words = name.toLowerCase().split(/\s+/).filter(Boolean);
      const id = `${words[0]} ${words[words.length - 1]}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .join(", ");
}

async function fetchBookByISBN(isbn: string): Promise<Book | null> {
  const headers = { "User-Agent": "ShoumikChowNow/1.0 (hello@shoumikchow.com)" };
  const id = encodeURIComponent(isbn);

  type Edition = {
    key?: string;
    title?: string;
    number_of_pages?: number;
    publish_date?: string;
    covers?: number[];
    authors?: Array<{ key?: string }>;
    works?: Array<{ key?: string }>;
  };
  type SearchDoc = { key?: string; title?: string; author_name?: string[]; author_key?: string[]; cover_i?: number };

  const [edition, docs] = await Promise.all([
    // Redirects to /books/<edition id>.json; fetch follows it.
    fetch(`https://openlibrary.org/isbn/${id}.json`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<Edition>) : null))
      .catch(() => null),
    fetch(`https://openlibrary.org/search.json?isbn=${id}&fields=key,title,author_name,author_key,cover_i&limit=5`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<{ docs?: SearchDoc[] }>) : null))
      .then((data) => data?.docs ?? [])
      .catch(() => [] as SearchDoc[]),
  ]);

  // An ISBN can match several works (reprints filed separately); the one the
  // edition belongs to is the right one to take the author from.
  const workKey = edition?.works?.[0]?.key;
  const doc = docs.find((d) => d.key && d.key === workKey) ?? docs[0];

  const title = pickTitle(edition?.title, doc?.title);
  if (!title) return null;

  // Open Library uses -1 in `covers` for a removed image.
  const cover = edition?.covers?.find((c) => c > 0) ?? (doc?.cover_i && doc.cover_i > 0 ? doc.cover_i : null);

  return {
    title,
    author: pickAuthors(edition?.authors, doc) || null,
    pages: edition?.number_of_pages || null,
    publishDate: edition?.publish_date || null,
    coverId: cover ? String(cover) : null,
    link: edition?.key
      ? `https://openlibrary.org${edition.key}`
      : doc?.key
        ? `https://openlibrary.org${doc.key}`
        : `https://openlibrary.org/isbn/${id}`,
    isbn,
  };
}

// Covers are the second half of the Reading card's latency problem. The public
// URL is a two-hop redirect that bottoms out at archive.org extracting the JPEG
// from inside a ZIP on demand — about 2s, and it cannot start until the books
// JSON lands, so the two delays are serial. Proxying through KV collapses that
// to a single edge read.
//
// Caching is unbounded on purpose: the id is content-addressed (one id is one
// uploaded image, which is why Open Library itself sends `expires` in 2126). If
// a book's cover is ever replaced, the new id arrives via the books JSON above,
// governed by BOOK_TTL.
const COVER_MAX_BYTES = 2 * 1024 * 1024;
// A cover Open Library does not have comes back as HTTP 200 carrying a 43-byte
// 1x1 transparent GIF, so "no cover" has to be detected by size rather than by
// status. Anything this small is that placeholder, never a real jacket.
const COVER_MIN_BYTES = 100;
const COVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Upstream sometimes omits Content-Type entirely, and its 1x1 placeholder is a
// GIF served from a .jpg path, so the header is not trustworthy on its own.
function sniffImageType(body: ArrayBuffer, header: string | null): string {
  const b = new Uint8Array(body.slice(0, 4));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  return header || "application/octet-stream";
}

async function handleCover(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");

  // Strict: this value is interpolated into an outbound URL, so anything but a
  // bare id is refused rather than sanitized.
  if (!id || !/^\d{1,12}$/.test(id)) {
    return jsonResponse({ error: "Invalid cover id" }, 400);
  }

  const key = `cover:${id}`;

  const hit = await env.KV?.getWithMetadata<{ type: string }>(key, "stream");
  if (hit?.value) {
    return new Response(hit.value, {
      headers: {
        "Content-Type": hit.metadata?.type || "image/jpeg",
        "Cache-Control": COVER_CACHE_CONTROL,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const res = await fetch(`https://covers.openlibrary.org/b/id/${id}-M.jpg`);
  if (!res.ok) {
    return jsonResponse({ error: "Cover unavailable" }, 502);
  }

  // Oversized covers are streamed straight through rather than buffered, so a
  // surprise from upstream cannot push the isolate toward its memory ceiling.
  const declared = Number(res.headers.get("Content-Length"));
  if (declared > COVER_MAX_BYTES) {
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const body = await res.arrayBuffer();

  // Never cached, and never under the immutable header: unlike a real cover
  // this is not content-addressed, and the jacket may well be uploaded later.
  if (body.byteLength < COVER_MIN_BYTES) {
    return jsonResponse({ error: "No cover for that id" }, 404);
  }

  const type = sniffImageType(body, res.headers.get("Content-Type"));

  if (body.byteLength <= COVER_MAX_BYTES) {
    ctx.waitUntil(
      env.KV?.put(key, body, { metadata: { type } }) ?? Promise.resolve()
    );
  }

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": COVER_CACHE_CONTROL,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleSteam(env: Env): Promise<Response> {
  if (!env.STEAM_API_KEY || !env.STEAM_ID) {
    return jsonResponse({ error: "Steam not configured" }, 503);
  }

  const res = await fetch(
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${env.STEAM_API_KEY}&steamid=${env.STEAM_ID}&format=json&count=3`
  );

  if (!res.ok) {
    return jsonResponse({ error: "Failed to fetch Steam data" }, 502);
  }

  const data: {
    response: {
      total_count?: number;
      games?: Array<{
        appid: number;
        name: string;
        playtime_2weeks: number;
        playtime_forever: number;
        img_icon_url: string;
      }>;
    };
  } = await res.json();

  if (!data.response.games?.length) {
    return jsonResponse([]);
  }

  const formatPlaytime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const games = data.response.games
    .sort((a, b) => b.playtime_2weeks - a.playtime_2weeks)
    .map((game) => ({
      name: game.name,
      appid: game.appid,
      cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900_2x.jpg`,
      playtimeForever: formatPlaytime(game.playtime_forever),
    }));

  return jsonResponse(games);
}

// Public endpoint, no key and no token to rotate — unlike Spotify below.
const LICHESS_USER = "shoumikchow";

// The board thumbnail. This endpoint serves the game in progress if there is
// one and the last finished game otherwise, so a single call covers both of the
// states the card can be in. Everything but the final position is stripped.
async function fetchLichessBoard(): Promise<{ fen: string; flipped: boolean; lastMoveAt: number | null } | null> {
  const res = await fetch(
    `https://lichess.org/api/user/${LICHESS_USER}/current-game?lastFen=true&moves=false&tags=false&clocks=false&evals=false&opening=false`,
    { headers: { accept: "application/json" } }
  );

  // 404 when the account has never played. Not an error worth failing the card over.
  if (!res.ok) return null;

  const game: {
    lastFen?: string;
    lastMoveAt?: number;
    players?: { black?: { user?: { id?: string } } };
  } = await res.json();

  if (!game.lastFen) return null;

  return {
    fen: game.lastFen,
    // Show the board from the side actually played.
    flipped: game.players?.black?.user?.id === LICHESS_USER,
    // When the most recent game last saw a move, so the palette and the
    // chatbot can say "played 3d ago". Already in this response; no extra call.
    lastMoveAt: typeof game.lastMoveAt === "number" ? game.lastMoveAt : null,
  };
}

async function handleLichess(): Promise<Response> {
  const [res, board] = await Promise.all([
    fetch(`https://lichess.org/api/user/${LICHESS_USER}`, {
      headers: { accept: "application/json" },
    }),
    fetchLichessBoard().catch(() => null),
  ]);

  if (!res.ok) {
    return jsonResponse({ error: "Failed to fetch Lichess data" }, 502);
  }

  const data: {
    url?: string;
    playing?: string;
    perfs?: Record<string, { games?: number; rating?: number; prog?: number }>;
  } = await res.json();

  const perfs = data.perfs ?? {};

  // Feature the format actually played most, not the best-rated one.
  const top = (["bullet", "blitz", "rapid", "classical"] as const)
    .map((format) => ({ format, ...(perfs[format] ?? {}) }))
    .filter((p) => (p.games ?? 0) > 0)
    .sort((a, b) => (b.games ?? 0) - (a.games ?? 0))[0];

  return jsonResponse({
    // Present only while a game is actually in progress.
    playing: data.playing ?? null,
    profile: data.url ?? `https://lichess.org/@/${LICHESS_USER}`,
    challenge: `https://lichess.org/?user=${LICHESS_USER}#friend`,
    top: top ? { format: top.format, rating: top.rating, prog: top.prog ?? 0 } : null,
    board: board ? { fen: board.fen, flipped: board.flipped } : null,
    lastPlayed: board?.lastMoveAt ? new Date(board.lastMoveAt).toISOString() : null,
  });
}

async function handleSpotify(env: Env): Promise<Response> {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET || !env.SPOTIFY_REFRESH_TOKEN) {
    return jsonResponse({ error: "Spotify not configured" }, 503);
  }

  // Use KV-stored token if available, otherwise fall back to secret
  const refreshToken = (await env.KV?.get("spotify_refresh_token")) || env.SPOTIFY_REFRESH_TOKEN;

  // Get access token using refresh token
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=refresh_token&refresh_token=" + refreshToken,
  });

  if (!tokenRes.ok) {
    // Spotify expires refresh tokens after 6 months (as of 2026-07-20) and returns
    // invalid_grant. Discard the stored KV copy so the next request falls back to the
    // re-authorized SPOTIFY_REFRESH_TOKEN secret instead of retrying the dead token.
    const err = await tokenRes.json<{ error?: string }>().catch(() => ({}) as { error?: string });
    if (err.error === "invalid_grant") {
      await env.KV?.delete("spotify_refresh_token");
    }
    return jsonResponse({ error: "Failed to refresh Spotify token" }, 502);
  }

  const tokenData: { access_token: string; refresh_token?: string } = await tokenRes.json();

  // Persist rotated refresh token if Spotify issued a new one
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    await env.KV?.put("spotify_refresh_token", tokenData.refresh_token);
  }

  // Get recently played
  const recentRes = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  );

  if (!recentRes.ok) {
    return jsonResponse({ error: "Failed to fetch recently played" }, 502);
  }

  const recentData: {
    items: Array<{
      track: {
        name: string;
        duration_ms: number;
        artists: Array<{ name: string }>;
        album: {
          name: string;
          release_date: string;
          images: Array<{ url: string; width: number }>;
        };
        external_urls: { spotify: string };
      };
      played_at: string;
    }>;
  } = await recentRes.json();

  if (!recentData.items || recentData.items.length === 0) {
    return jsonResponse({ error: "No recently played tracks" }, 404);
  }

  const item = recentData.items[0];
  const albumArt = item.track.album.images.find((img) => img.width === 300)?.url ||
    item.track.album.images[0]?.url;

  // Format duration from ms to m:ss
  const totalSeconds = Math.floor(item.track.duration_ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const duration = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return jsonResponse({
    title: item.track.name,
    artist: item.track.artists.map((a) => a.name).join(", "),
    album: item.track.album.name,
    albumArt,
    duration,
    releaseDate: item.track.album.release_date,
    link: item.track.external_urls.spotify,
    playedAt: item.played_at,
  });
}

// ─── Right now, for the chatbot ─────────────────────────────
// The chatbot answers from the site's Markdown, and the Now section is not in
// it: now.js fills it in the browser, so the twins (and the prompt) only ever
// saw an empty heading. This writes the same five feeds as a few plain
// sentences for the prompt, so "what has he been reading?" has an answer.
//
// The handlers are called in-process rather than over HTTP: a worker fetching
// its own workers.dev URL is not a reliable subrequest, and this way each feed
// keeps its own caching (the books' KV layer, Spotify's token handling).
//
// Cached for five minutes per isolate, the same freshness the Now cards'
// Cache-Control gives browsers. Each channel gets a deadline, so one slow
// upstream costs its line in the answer, never the answer itself.
//
// A channel that fails is left out, not reported as empty. "He isn't reading
// anything" and "the book lookup is down" are different facts, and only the
// first is one the bot may state; with the line missing it says his site does
// not cover it, which is true.
const NOW_TTL_MS = 5 * 60 * 1000;
const NOW_DEADLINE_MS = 2500;

let nowCache: { text: string; at: number; origin: string } | null = null;

function longDate(value: string | Date): string | null {
  const date = typeof value === "string"
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
    : value;
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The body of a handler's response if it succeeded in time, otherwise null.
async function feed<T>(pending: Promise<Response>): Promise<T | null> {
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), NOW_DEADLINE_MS));
  try {
    const res = await Promise.race([pending, deadline]);
    if (!res || !res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function nowNotes(env: Env, ctx: ExecutionContext, origin: string): Promise<string> {
  if (nowCache && nowCache.origin === origin && Date.now() - nowCache.at < NOW_TTL_MS) {
    return nowCache.text;
  }

  // The reading list is the one input the worker cannot get from an account;
  // the site publishes it (now.json). An unreachable file is unknown, not an
  // empty list: treating it as empty would have the bot say he is "not reading
  // a book" whenever the site is down or not yet deployed.
  const reading = await feed<{ reading?: string[] }>(fetch(`${origin}/now.json`));
  const isbns = reading ? (reading.reading ?? []).filter(isValidIsbn) : null;

  type Song = { title: string; artist: string; album?: string; playedAt?: string };
  type Film = { title: string; year?: string; director?: string; rating?: string; watchedDate?: string; rewatch?: boolean };
  type Game = { name: string; playtimeForever?: string };
  type Chess = { playing?: string | null; top?: { rating: number; format: string; prog?: number } | null; lastPlayed?: string | null };
  type BookOut = { title: string; author?: string | null; started?: string | null };

  const [song, books, film, games, chess] = await Promise.all([
    feed<Song>(handleSpotify(env)),
    isbns && isbns.length
      ? feed<BookOut[]>(handleBooks(new Request(`https://now.internal/books?isbns=${isbns.join(",")}`), env, ctx))
      : Promise.resolve([] as BookOut[]),
    feed<Film>(handleLetterboxd(env)),
    feed<Game[]>(handleSteam(env)),
    feed<Chess>(handleLichess()),
  ]);

  const lines: string[] = [];

  if (song) {
    const when = song.playedAt ? longDate(song.playedAt) : null;
    lines.push(`Most recent song on Spotify: "${song.title}" by ${song.artist}${song.album ? `, from the album ${song.album}` : ""}${when ? `, played ${when}` : ""}.`);
  }

  // No list configured means "between books", which the homepage says too. A
  // configured list that came back empty means the lookup failed, and an
  // unreadable list means nothing is known: in both cases, say nothing.
  if (isbns === null) {
    // Unknown; leave reading out.
  } else if (!isbns.length) {
    lines.push("Reading: not reading a book at the moment.");
  } else if (books && books.length) {
    lines.push(`Currently reading: ${books.map((b) => {
      const since = b.started ? longDate(b.started) : null;
      return `"${b.title}"${b.author ? ` by ${b.author}` : ""}${since ? `, started ${since}` : ""}`;
    }).join("; ")}.`);
  }

  if (film) {
    const when = film.watchedDate ? longDate(film.watchedDate) : null;
    const parts = [
      film.director ? `directed by ${film.director}` : null,
      film.rating ? `he rated it ${film.rating} out of five stars` : null,
      when ? `watched ${when}` : null,
      film.rewatch ? "a rewatch" : null,
    ].filter(Boolean);
    lines.push(`Most recent film logged on Letterboxd: "${film.title}"${film.year ? ` (${film.year})` : ""}${parts.length ? `, ${parts.join(", ")}` : ""}.`);
  }

  if (games) {
    lines.push(games.length
      ? `Recently played on Steam: ${games.map((g) => `${g.name}${g.playtimeForever ? ` (${g.playtimeForever} played in total)` : ""}`).join("; ")}.`
      : "Games: has not played anything on Steam recently.");
  }

  if (chess) {
    if (chess.playing) {
      lines.push("Chess: in a live game on Lichess right now.");
    } else if (chess.top) {
      const prog = chess.top.prog;
      const trend = prog ? `, ${prog > 0 ? "up" : "down"} ${Math.abs(prog)} over his recent games` : "";
      const when = chess.lastPlayed ? longDate(chess.lastPlayed) : null;
      lines.push(`Chess: his Lichess ${chess.top.format} rating is ${chess.top.rating}${trend}${when ? `; his most recent game was ${when}` : ""}. Visitors can challenge him on Lichess.`);
    }
  }

  const text = lines.length
    ? `## right now\n\nA live snapshot of what he has been listening to, reading, watching and playing, as shown in the Now section of his homepage. Today is ${longDate(new Date())}.\n\n${lines.join("\n")}`
    : "";

  nowCache = { text, at: Date.now(), origin };
  return text;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Ahead of the shared OPTIONS branch: /chat is POST-only against a fixed
    // origin list, so it cannot use the GET/"*" preflight the feeds send.
    // /chat/status rides along with it because it shares those CORS headers and
    // must skip jsonResponse()'s blanket max-age, which it sets for itself.
    if (path === "/chat" || path === "/chat/status") {
      try {
        return path === "/chat"
          ? await handleChat(request, env, (origin) => nowNotes(env, ctx, origin))
          : await handleChatStatus(request, env);
      } catch {
        return jsonResponse({ error: "Internal error" }, 500);
      }
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: baseHeaders });
    }

    try {
      switch (path) {
        case "/letterboxd":
          return handleLetterboxd(env);
        case "/books":
          return handleBooks(request, env, ctx);
        case "/cover":
          return handleCover(request, env, ctx);
        case "/spotify":
          return handleSpotify(env);
        case "/steam":
          return handleSteam(env);
        case "/lichess":
          return handleLichess();
        default:
          return jsonResponse({ error: "Not found" }, 404);
      }
    } catch {
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },
};
