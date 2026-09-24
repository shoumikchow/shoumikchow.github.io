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

# Analytics Engine's FORMAT takes only JSON, JSONEachRow or TabSeparated;
# there is no variant that prints column names, so each query passes its own
# header. On failure the API's own message is printed: it says exactly which
# part of the SQL it rejected, and a bare curl status code does not.
query() {
  local title="$1" header="$2" sql="$3" body
  echo
  echo "── $title"
  if ! body=$(curl -sS --fail-with-body \
      "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
      -H "Authorization: Bearer ${CF_ANALYTICS_TOKEN}" \
      --data "$sql FORMAT TabSeparated" 2>&1); then
    echo "query failed: $body" >&2
    failed=1
    return 0
  fi
  if [[ -z "$body" ]]; then
    echo "(nothing yet)"
    return 0
  fi
  printf '%s\n%s\n' "$header" "$body" | column -t -s $'\t'
}

# Every query runs even if one fails, so a single run shows every problem.
failed=0
WHERE="timestamp > NOW() - INTERVAL '${DAYS}' DAY"

echo "⌘K palette, last ${DAYS} days"

# The headline. dismiss / open is the share of opens that went nowhere.
query "Events" $'event\tn' "
  SELECT blob1 AS event, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE
  GROUP BY event ORDER BY n DESC"

query "How it was opened" $'via\tn' "
  SELECT blob2 AS via, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'open'
  GROUP BY via ORDER BY n DESC"

# queried = no means the pick came from the empty-state menu, not a search.
query "What gets picked, by kind" $'kind\tqueried\tn' "
  SELECT blob3 AS kind, blob7 AS queried, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'pick'
  GROUP BY kind, queried ORDER BY n DESC"

query "Top picks" $'item\tn\tavg_rank' "
  SELECT blob4 AS item, SUM(_sample_interval) AS n,
         SUM(double1 * _sample_interval) / SUM(_sample_interval) AS avg_rank
  FROM palette_events WHERE $WHERE AND blob1 = 'pick'
  GROUP BY item ORDER BY n DESC LIMIT 15"

query "Questions asked, by route" $'source\tn' "
  SELECT blob5 AS source, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'ask'
  GROUP BY source ORDER BY n DESC"

query "Pages it was opened from" $'path\tn' "
  SELECT blob6 AS path, SUM(_sample_interval) AS n
  FROM palette_events WHERE $WHERE AND blob1 = 'open'
  GROUP BY path ORDER BY n DESC"

exit "$failed"
