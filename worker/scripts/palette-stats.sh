#!/usr/bin/env bash
# How the ⌘K palette is being used, from the palette_events dataset that
# /palette/event writes to (src/palette.ts).
#
#   CF_ANALYTICS_TOKEN=... ./scripts/palette-stats.sh [days]   (default 14)
#
# The token is a Cloudflare API token with one permission,
# Account > Account Analytics > Read. Wrangler's login carries no analytics
# scope (see `wrangler whoami`), so this needs its own.
#
# Counts are SUM(_sample_interval), not COUNT(): Analytics Engine samples at
# volume, and each surviving row carries how many rows it stands for. At this
# site's traffic the interval will be 1, but the sum stays right either way.
set -euo pipefail

ACCOUNT_ID="${CF_ACCOUNT_ID:-ad54a5022941c2058e2dee978cf6f025}"
DAYS="${1:-14}"
: "${CF_ANALYTICS_TOKEN:?Set CF_ANALYTICS_TOKEN to an API token with Account Analytics: Read}"

if ! [[ "$DAYS" =~ ^[0-9]+$ ]]; then
  echo "days must be a whole number" >&2
  exit 1
fi

query() {
  local title="$1" sql="$2"
  echo
  echo "── $title"
  curl -sS --fail-with-body \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
    -H "Authorization: Bearer ${CF_ANALYTICS_TOKEN}" \
    --data "$sql FORMAT TabSeparatedWithNames" | column -t -s $'\t'
}

WHERE="timestamp > NOW() - INTERVAL '${DAYS}' DAY"

echo "⌘K palette, last ${DAYS} days"

# The headline. dismiss / open is the share of opens that went nowhere.
query "Events" "
  SELECT blob1 AS event, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE
  GROUP BY event ORDER BY n DESC"

query "How it was opened" "
  SELECT blob2 AS via, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'open'
  GROUP BY via ORDER BY n DESC"

# queried = no means the pick came from the empty-state menu, not a search.
query "What gets picked, by kind" "
  SELECT blob3 AS kind, blob7 AS queried, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'pick'
  GROUP BY kind, queried ORDER BY n DESC"

query "Top picks" "
  SELECT blob4 AS item, SUM(_sample_interval) AS n, AVG(double1) AS avg_rank
  FROM palette_events WHERE $WHERE AND blob1 = 'pick'
  GROUP BY item ORDER BY n DESC LIMIT 15"

query "Questions asked, by route" "
  SELECT blob5 AS source, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'ask'
  GROUP BY source ORDER BY n DESC"

query "Pages it was opened from" "
  SELECT blob6 AS path, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'open'
  GROUP BY path ORDER BY n DESC"
