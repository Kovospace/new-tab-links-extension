#!/usr/bin/env bash
#
# Lists an account's profiles with how much each one holds, and optionally deletes the empty
# ones. Written for a single job: clearing the duplicate "Default" profiles that an earlier
# version of this extension minted, one per new tab page opened, before the phantom-profile
# fix. Nothing in the extension can delete a profile, so this is the only way to do it.
#
#   ./tools/prune-empty-profiles.sh                      # list only, changes nothing
#   ./tools/prune-empty-profiles.sh --delete-empty       # delete every profile holding nothing
#
# It never touches a profile that holds anything, and never touches the one holding the most,
# so it cannot leave the account with nowhere to put links.
#
set -euo pipefail

API="${NEWTABLINKS_API:-https://api.tabilinks.app}"
DELETE_EMPTY=false
[ "${1:-}" = "--delete-empty" ] && DELETE_EMPTY=true

read -rp "Username or email: " USERNAME
read -rsp "Password: " PASSWORD; echo

TOKEN=$(curl -fsS -X POST "$API/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Name: profile cleanup script' \
  -d "{\"usernameOrEmail\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')

SNAPSHOT=$(curl -fsS "$API/api/v1/sync/snapshot" -H "Authorization: Bearer $TOKEN")

echo "$SNAPSHOT" | DELETE_EMPTY="$DELETE_EMPTY" python3 -c '
import json, os, sys

snapshot = json.load(sys.stdin)
profile_of_environment = {e["id"]: e["profileId"] for e in snapshot["environments"]}
environment_of_group = {g["id"]: g["environmentId"] for g in snapshot["groups"]}

held = {p["id"]: {"environments": 0, "groups": 0, "links": 0} for p in snapshot["profiles"]}
for environment in snapshot["environments"]:
    held[environment["profileId"]]["environments"] += 1
for group in snapshot["groups"]:
    held[profile_of_environment[group["environmentId"]]]["groups"] += 1
for link in snapshot["links"]:
    environment = environment_of_group[link["parentGroupId"]]
    held[profile_of_environment[environment]]["links"] += 1

def total(profile_id):
    counts = held[profile_id]
    return counts["environments"] + counts["groups"] + counts["links"]

fullest = max(snapshot["profiles"], key=lambda p: total(p["id"]))["id"]

print()
print("%-38s %-20s %s" % ("id", "name", "holds"))
empty = []
for profile in sorted(snapshot["profiles"], key=lambda p: p["position"]):
    counts = held[profile["id"]]
    summary = "%d workspaces, %d groups, %d links" % (
        counts["environments"], counts["groups"], counts["links"])
    marker = ""
    if total(profile["id"]) == 0 and profile["id"] != fullest:
        marker = "   <- empty"
        empty.append(profile["id"])
    print("%-38s %-20s %s%s" % (profile["id"], profile["name"], summary, marker))

with open("/tmp/ntl-empty-profiles", "w") as handle:
    handle.write("\n".join(empty))
print()
print("%d empty profile(s)." % len(empty), end=" ")
print("Re-run with --delete-empty to remove them." if os.environ["DELETE_EMPTY"] != "true"
      else "Deleting them now.")
'

if [ "$DELETE_EMPTY" = true ]; then
  while read -r PROFILE_ID; do
    [ -z "$PROFILE_ID" ] && continue
    STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
      "$API/api/v1/profiles/$PROFILE_ID" -H "Authorization: Bearer $TOKEN")
    echo "  deleted $PROFILE_ID -> $STATUS"
  done < /tmp/ntl-empty-profiles
  echo "Done. Reload the new tab page in each browser; the deletions arrive with the next pull."
fi
