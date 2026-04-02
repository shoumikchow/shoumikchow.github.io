interface Env {
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

async function handleBooks(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const isbns = url.searchParams.get("isbns");

  if (!isbns) {
    return jsonResponse({ error: "No ISBNs provided" }, 400);
  }

  const isbnList = isbns.split(",").map((s) => s.trim()).filter(Boolean);
  const books = await Promise.all(isbnList.map(fetchBookByISBN));

  return jsonResponse(books.filter(Boolean));
}

async function fetchBookByISBN(isbn: string): Promise<unknown | null> {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    { headers: { "User-Agent": "ShoumikChowNow/1.0 (hello@shoumikchow.com)" } }
  );

  if (!res.ok) return null;

  const data: Record<string, {
    title: string;
    authors?: Array<{ name: string }>;
    number_of_pages?: number;
    publish_date?: string;
    cover?: { small?: string; medium?: string; large?: string };
    url?: string;
  }> = await res.json();

  const key = `ISBN:${isbn}`;
  const book = data[key];
  if (!book) return null;

  return {
    title: book.title,
    author: book.authors?.map((a) => a.name).join(", ") || null,
    pages: book.number_of_pages || null,
    publishDate: book.publish_date || null,
    cover: book.cover?.medium || book.cover?.large || null,
    link: book.url || `https://openlibrary.org/isbn/${isbn}`,
    isbn,
  };
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: baseHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case "/letterboxd":
          return handleLetterboxd(env);
        case "/books":
          return handleBooks(request);
        case "/spotify":
          return handleSpotify(env);
        case "/steam":
          return handleSteam(env);
        default:
          return jsonResponse({ error: "Not found" }, 404);
      }
    } catch {
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },
};
