The `/spotify` worker endpoint is returning `Failed to refresh Spotify token`. Spotify expires refresh tokens 6 months after the original authorization, and rotation does **not** reset the clock — so this needs a manual re-consent (a human clicking "Authorize"). It can't be automated.

## Fix (from `worker/`)

1. In the Spotify app dashboard, ensure `http://127.0.0.1:8888/callback` is a redirect URI.
2. Open in a browser (fill in your client id):
   ```
   https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://127.0.0.1:8888/callback&scope=user-read-recently-played
   ```
3. Copy the `?code=...` from the redirect URL and exchange it:
   ```
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Authorization: Basic $(printf '%s' 'CLIENT_ID:CLIENT_SECRET' | base64)" \
     -d grant_type=authorization_code -d code=THE_CODE \
     -d redirect_uri=http://127.0.0.1:8888/callback
   ```
4. Take `refresh_token` from the JSON and update the worker:
   ```
   cd worker
   npx wrangler secret put SPOTIFY_REFRESH_TOKEN                   # paste the new token
   npx wrangler kv key delete --binding=KV spotify_refresh_token   # clear the stale rotated token
   ```
5. Close this issue once `/spotify` returns a track again. Next expiry: ~6 months from today.
