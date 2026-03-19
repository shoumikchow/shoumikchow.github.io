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
wrangler dev     # local dev server
wrangler deploy  # deploy to Cloudflare
```

The worker requires the following secrets (set via `wrangler secret put <NAME>`):

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`
- `TMDB_API_KEY`
- `STEAM_API_KEY`
- `STEAM_ID`
