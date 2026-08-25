# shoumikchow.com

Personal website and portfolio for Shoumik Chowdhury.

Built with [Jekyll](https://jekyllrb.com/) using a customized [minimal theme](https://github.com/pages-themes/minimal), hosted on [GitHub Pages](https://pages.github.com/).

## Right Now section

The homepage features a live "Right Now" section that shows what I'm currently listening to, reading, watching, and playing. This is powered by a [Cloudflare Worker](https://workers.cloudflare.com/) that proxies and caches data from several APIs:

- **Listening** — Last played track from [Spotify](https://developer.spotify.com/documentation/web-api/)
- **Reading** — Books via [Open Library API](https://openlibrary.org/developers/api), with ISBNs configured in `_config.yml`
- **Watching** — Last watched film from [Letterboxd](https://letterboxd.com/) RSS, enriched with metadata from [TMDB](https://www.themoviedb.org/documentation/api)
- **Playing** — Recently played games from the [Steam Web API](https://steamcommunity.com/dev)
- **Chessing** — Rating and live-game status from the [Lichess API](https://lichess.org/api), with the current or last position drawn as an inline SVG board

The worker source lives in the `worker/` directory and responses are cached at the edge for 5 minutes.

## Markdown twins

Every page is published twice: the usual HTML, and its raw Markdown source at the same URL with `.md` appended (`/about` → `/about.md`) — the convention docs sites use for LLM consumers. GitHub Pages allows no custom plugins, so each one is a short Liquid stub in `md/` that echoes the source page's content. The homepage stub also strips the "Right Now" markup, which is just empty divs without JavaScript.

They are kept out of the sitemap and discoverable two other ways: a `rel="alternate"` link in the head of each page built from a `.md` source, and `llms.txt`.

## Terminal content negotiation

`curl -L shoumikchow.com` returns the Markdown as `text/plain`; browsers get the usual HTML. The `-L` is needed because a bare hostname makes curl try `http://`, and Cloudflare's HTTPS redirect fires before the worker ever runs. A second worker in `worker-terminal/` picks between the two existing representations based on the `User-Agent` and `Accept` headers — it converts nothing, holds no secrets, and has no bindings. Every failure path degrades to the HTML page.

Its `wrangler.toml` lists one exact route per page rather than `shoumikchow.com/*`, so assets, PDFs, `sitemap.xml`, `/.well-known/*` and the `.md` files never reach the worker. The cost is that a new page needs a line there, and until it gets one it serves HTML to curl.

## Generated files

These are built from `_config.yml` or from the build time rather than maintained by hand:

- `llms.txt` — site index for LLM consumers, pointing at the Markdown twins
- `shoumik.vcf` — contact card
- `.well-known/security.txt` — [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) security contact. `Expires` is generated as build time + 365 days, so it cannot silently lapse. Dependabot pushes normally rebuild the site well inside a year; the yearly `Refresh security.txt Expires` workflow is the backstop for a quiet one, and it verifies the live date actually moved.

The site also serves [WKD](https://wiki.gnupg.org/WKD) from `.well-known/openpgpkey/`, so `gpg --locate-keys hello@shoumikchow.com` resolves. The published key carries only the `hello@` uid.

## Local development

```sh
bundle install
bundle exec jekyll serve
```

## Worker development

There are two workers, deployed separately and sharing no code: `worker/` (the "Right Now" API proxy) and `worker-terminal/` (content negotiation on the apex). They are kept apart on purpose — the Now worker changes often as the Letterboxd/TMDB/Spotify/Steam feeds break, which is not something that should sit in front of the homepage.

```sh
cd worker
npm install
npx wrangler dev     # local dev server
npx wrangler deploy  # deploy to Cloudflare
```

`worker-terminal/` is a single file with no dependencies, so it has no `package.json` — run `npx wrangler dev` / `npx wrangler deploy` in it directly.

The Now worker requires the following secrets (set via `npx wrangler secret put <NAME>`). The terminal worker needs none:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`
- `TMDB_API_KEY`
- `STEAM_API_KEY`
- `STEAM_ID`

## Refreshing the Spotify token

Spotify expires refresh tokens 6 months after the original authorization, and
rotation does **not** reset the clock — so roughly twice a year the `/spotify`
endpoint dies with `invalid_grant` and needs a fresh token. The
`Spotify Token Healthcheck` GitHub Action pings the endpoint weekly and opens an
issue when this happens. To fix (a re-consent requires a human, it can't be
automated):

1. In the Spotify app dashboard, ensure `http://127.0.0.1:8888/callback` is a
   redirect URI.
2. Open in a browser (fill in your client id):
   ```
   https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://127.0.0.1:8888/callback&scope=user-read-recently-played
   ```
3. Copy the `?code=...` from the redirect URL and exchange it:
   ```sh
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Authorization: Basic $(printf '%s' 'CLIENT_ID:CLIENT_SECRET' | base64)" \
     -d grant_type=authorization_code -d code=THE_CODE \
     -d redirect_uri=http://127.0.0.1:8888/callback
   ```
4. Take `refresh_token` from the JSON and update the worker (no redeploy needed —
   secrets and KV push straight to the live worker):
   ```sh
   cd worker
   npx wrangler secret put SPOTIFY_REFRESH_TOKEN               # paste the new token
   npx wrangler kv key delete --binding=KV spotify_refresh_token   # clear the stale rotated token
   ```
