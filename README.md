# shoumikchow.com

Personal website and portfolio for Shoumik Chowdhury.

Built with [Jekyll](https://jekyllrb.com/) using a customized [minimal theme](https://github.com/pages-themes/minimal), hosted on [GitHub Pages](https://pages.github.com/).

## Right Now section

The homepage features a live "Right Now" section that shows what I'm currently listening to, reading, watching, and playing. This is powered by a [Cloudflare Worker](https://workers.cloudflare.com/) that proxies and caches data from several APIs:

- **Listening** — Last played track from [Spotify](https://developer.spotify.com/documentation/web-api/)
- **Reading** — Books via [Open Library API](https://openlibrary.org/developers/api), with ISBNs configured in `_config.yml`
- **Watching** — Last watched film from [Letterboxd](https://letterboxd.com/) RSS, enriched with metadata from [TMDB](https://www.themoviedb.org/documentation/api)
- **Playing** — Recently played games from the [Steam Web API](https://steamcommunity.com/dev)

The worker source lives in the `worker/` directory and responses are cached at the edge for 5 minutes.

## Local development

```sh
bundle install
bundle exec jekyll serve
```

## Worker development

```sh
cd worker
npm install
npx wrangler dev     # local dev server
npx wrangler deploy  # deploy to Cloudflare
```

The worker requires the following secrets (set via `npx wrangler secret put <NAME>`):

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
