// Update this URL after deploying your Cloudflare Worker
const WORKER_URL = "https://shoumikchow-now.shoumikchow.workers.dev";

function createErrorState(msg = "unavailable") {
  return `<span class="now-error">${escapeHtml(msg)}</span>`;
}

function timeAgo(dateStr) {
  const now = new Date();
  // Parse as local midnight to avoid UTC offset issues with date-only strings like "2026-03-22"
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = parts
    ? new Date(+parts[1], +parts[2] - 1, +parts[3])
    : new Date(dateStr);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadLetterboxd() {
  const el = document.getElementById("now-movie");
  if (!el) return;

  try {
    const res = await fetch(`${WORKER_URL}/letterboxd`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    const posterHtml = data.poster
      ? `<img src="${escapeHtml(data.poster)}" alt="${escapeHtml(data.title)}" class="now-poster" />`
      : "";

    const metaParts = [
      data.year,
      data.runtime,
      data.director ? `dir. ${data.director}` : null,
    ].filter(Boolean);

    const genreHtml = data.genres && data.genres.length
      ? `<span class="now-meta">${data.genres.slice(0, 2).map(escapeHtml).join(", ")}</span>`
      : "";

    el.innerHTML = `
      <a href="${escapeHtml(data.link)}" target="_blank" rel="noopener" class="now-card-link">
        ${posterHtml}
        <div class="now-info">
          <strong class="now-title">${escapeHtml(data.title)}${data.rewatch ? ' <span class="now-rewatch" title="Rewatch">&#8635;</span>' : ""}</strong>
          ${metaParts.length ? `<span class="now-meta">${metaParts.map(escapeHtml).join(" &middot; ")}</span>` : ""}
          ${data.rating ? `<span class="now-rating">${escapeHtml(data.rating)}</span>` : ""}
          ${genreHtml}
          ${data.watchedDate ? `<span class="now-time">${timeAgo(data.watchedDate)}</span>` : ""}
        </div>
      </a>
    `;
  } catch {
    el.innerHTML = createErrorState("the projector jammed — no movie for you");
  }
}

async function loadBooks() {
  const el = document.getElementById("now-books");
  if (!el) return;

  const isbns = el.dataset.isbns;
  if (!isbns) {
    el.innerHTML = `<p class="now-empty">Between books. Send recs.</p>`;
    return;
  }

  try {
    const res = await fetch(`${WORKER_URL}/books?isbns=${encodeURIComponent(isbns)}`);
    if (!res.ok) throw new Error();
    const books = await res.json();

    if (!books.length) {
      el.innerHTML = `<p class="now-empty">Between books. Send recs.</p>`;
      return;
    }

    el.innerHTML = books
      .map((book) => {
        const coverHtml = book.cover
          ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" class="now-poster now-poster-book" />`
          : "";

        const meta = [book.author, book.pages ? `${book.pages} pages` : null]
          .filter(Boolean)
          .join(" &middot; ");

        return `
          <a href="${escapeHtml(book.link)}" target="_blank" rel="noopener" class="now-card-link">
            ${coverHtml}
            <div class="now-info">
              <strong class="now-title">${escapeHtml(book.title)}</strong>
              ${meta ? `<span class="now-meta">${meta}</span>` : ""}
            </div>
          </a>
        `;
      })
      .join("");
  } catch {
    el.innerHTML = createErrorState("dropped my bookmark in the void");
  }
}

async function loadSpotify() {
  const el = document.getElementById("now-music");
  if (!el) return;

  try {
    const res = await fetch(`${WORKER_URL}/spotify`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    const artHtml = data.albumArt
      ? `<img src="${escapeHtml(data.albumArt)}" alt="${escapeHtml(data.album)}" class="now-poster" />`
      : "";

    const spotifyMeta = [
      data.artist,
      data.duration,
    ].filter(Boolean);

    el.innerHTML = `
      <a href="${escapeHtml(data.link)}" target="_blank" rel="noopener" class="now-card-link">
        ${artHtml}
        <div class="now-info">
          <strong class="now-title">${escapeHtml(data.title)}</strong>
          ${spotifyMeta.length ? `<span class="now-meta">${spotifyMeta.map(escapeHtml).join(" &middot; ")}</span>` : ""}
          ${data.album ? `<span class="now-meta">${escapeHtml(data.album)}${data.releaseDate ? ` (${escapeHtml(data.releaseDate.substring(0, 4))})` : ""}</span>` : ""}
          ${data.playedAt ? `<span class="now-time">${timeAgo(data.playedAt)}</span>` : ""}
        </div>
      </a>
    `;
  } catch {
    el.innerHTML = createErrorState("silence — my Spotify token ghosted me again");
  }
}

async function loadSteam() {
  const el = document.getElementById("now-gaming");
  if (!el) return;

  try {
    const res = await fetch(`${WORKER_URL}/steam`);
    if (!res.ok) throw new Error();
    const games = await res.json();

    if (!games.length) {
      el.innerHTML = `<p class="now-empty">Touching grass instead of controllers lately.</p>`;
      return;
    }

    el.innerHTML = games
      .map((game) => {
        const coverHtml = game.cover
          ? `<img src="${escapeHtml(game.cover)}" alt="${escapeHtml(game.name)}" class="now-poster now-poster-game" />`
          : "";

        const storeUrl = `https://store.steampowered.com/app/${encodeURIComponent(game.appid)}`;

        return `
          <a href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener noreferrer" class="now-card-link">
            ${coverHtml}
            <div class="now-info">
              <strong class="now-title">${escapeHtml(game.name)}</strong>
              <span class="now-meta">${escapeHtml(game.playtimeForever)} played</span>
            </div>
          </a>
        `;
      })
      .join("");
  } catch {
    el.innerHTML = createErrorState("rage quit — stats unavailable");
  }
}

// Solid (nominally black) glyphs for both sides — the outline set renders as a
// few illegible strokes at thumbnail size, so colour carries the side instead.
const PIECE_GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

// Board position as inline SVG rather than an image from Lichess, so it picks up
// the site palette and stays sharp at any density. Returns "" for anything that
// is not a well-formed 8x8 placement; the card then just renders without art.
function renderBoard(board) {
  if (!board || typeof board.fen !== "string") return "";

  const ranks = board.fen.split(" ")[0].split("/");
  if (ranks.length !== 8) return "";

  const rows = [];
  for (const rank of ranks) {
    const squares = [];
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        squares.push(...Array(Number(ch)).fill(null));
      } else if (PIECE_GLYPHS[ch.toLowerCase()]) {
        squares.push(ch);
      } else {
        return "";
      }
    }
    if (squares.length !== 8) return "";
    rows.push(squares);
  }

  if (board.flipped) {
    rows.reverse();
    rows.forEach((row) => row.reverse());
  }

  // Squares first, pieces second: glyphs overhang their cell a little and would
  // otherwise be clipped by the next square painted on top of them.
  let squares = "";
  let pieces = "";
  rows.forEach((row, y) => {
    row.forEach((piece, x) => {
      const shade = (x + y) % 2 === 0 ? "light" : "dark";
      squares += `<rect x="${x}" y="${y}" width="1" height="1" class="now-sq now-sq--${shade}" />`;
      if (!piece) return;
      const side = piece === piece.toUpperCase() ? "w" : "b";
      pieces += `<text x="${x + 0.5}" y="${y + 0.5}" class="now-pc now-pc--${side}">${PIECE_GLYPHS[piece.toLowerCase()]}</text>`;
    });
  });

  return `<svg viewBox="0 0 8 8" class="now-poster now-poster-board" role="img" aria-label="Board position">${squares}${pieces}</svg>`;
}

// Rising or falling sparkline for the rating trend. Decorative — the meta line
// already spells the direction out in words — so it is hidden from assistive
// tech rather than duplicating "up 6 lately".
function renderTrendIcon(prog) {
  const up = prog > 0;
  const line = up ? "M1 8 L4.5 4.5 L6.5 6 L10 2" : "M1 2 L4.5 5.5 L6.5 4 L10 8";
  const head = up ? "M7.5 2 L10 2 L10 4.5" : "M7.5 8 L10 8 L10 5.5";
  return `<svg viewBox="0 0 11 10" class="now-trend now-trend--${up ? "up" : "down"}" aria-hidden="true"><path d="${line}" /><path d="${head}" /></svg>`;
}

async function loadChess() {
  const el = document.getElementById("now-chess");
  if (!el) return;

  try {
    const res = await fetch(`${WORKER_URL}/lichess`);
    if (!res.ok) throw new Error();
    const data = await res.json();

    const boardHtml = renderBoard(data.board);

    // A live game is the only genuinely "now" state, so it wins when present.
    if (data.playing) {
      el.innerHTML = `
        <a href="${escapeHtml(data.playing)}" target="_blank" rel="noopener noreferrer" class="now-card-link">
          ${boardHtml}
          <div class="now-info">
            <strong class="now-title">In a game right now</strong>
            <span class="now-meta">watch it live on Lichess</span>
          </div>
        </a>
      `;
      return;
    }

    if (!data.top) {
      el.innerHTML = `<p class="now-empty">Away from the board lately.</p>`;
      return;
    }

    const prog = data.top.prog;
    // Spell the trend out — a bare "−6" means nothing without knowing it is
    // Lichess's rating change over the last dozen rated games. Drops out
    // entirely at 0 rather than printing "up 0".
    const trend = prog
      ? `${prog > 0 ? "up" : "down"} ${Math.abs(prog)} lately · `
      : "";
    const trendIcon = prog ? renderTrendIcon(prog) : "";

    el.innerHTML = `
      <a href="${escapeHtml(data.challenge)}" target="_blank" rel="noopener noreferrer" class="now-card-link">
        ${boardHtml}
        <div class="now-info">
          <strong class="now-title">${escapeHtml(String(data.top.rating))} ${escapeHtml(data.top.format)} on Lichess</strong>
          <span class="now-meta">${trendIcon}${escapeHtml(trend)}challenge me</span>
        </div>
      </a>
    `;
  } catch {
    el.innerHTML = createErrorState("blundered — ratings unavailable");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadLetterboxd();
  loadBooks();
  loadSpotify();
  loadSteam();
  loadChess();
});
