// Update this URL after deploying your Cloudflare Worker
const WORKER_URL = "https://shoumikchow-now.shoumik.workers.dev";

function createErrorState() {
  return '<span class="now-error">unavailable</span>';
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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
          ${data.watchedDate ? `<span class="now-time">Watched ${timeAgo(data.watchedDate)}</span>` : ""}
        </div>
      </a>
    `;
  } catch {
    el.innerHTML = createErrorState();
  }
}

async function loadBooks() {
  const el = document.getElementById("now-books");
  if (!el) return;

  const isbns = el.dataset.isbns;
  if (!isbns) {
    el.innerHTML = createErrorState();
    return;
  }

  try {
    const res = await fetch(`${WORKER_URL}/books?isbns=${encodeURIComponent(isbns)}`);
    if (!res.ok) throw new Error();
    const books = await res.json();

    if (!books.length) {
      el.innerHTML = createErrorState();
      return;
    }

    el.innerHTML = books
      .map((book) => {
        const coverHtml = book.cover
          ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" class="now-poster now-poster-book" />`
          : "";

        const meta = [book.author, book.pages ? `${book.pages}p` : null, book.publishDate]
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
    el.innerHTML = createErrorState();
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
    el.innerHTML = createErrorState();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadLetterboxd();
  loadBooks();
  loadSpotify();
});
