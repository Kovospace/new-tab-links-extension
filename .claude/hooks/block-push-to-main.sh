#!/usr/bin/env bash
# PreToolUse/Bash hook: refuse any `git push` whose destination is main or master.
# Reads the hook payload on stdin, prints a deny decision as JSON, always exits 0.
set -uo pipefail

command_line=$(jq -r '.tool_input.command // ""' 2>/dev/null)

deny() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 0
}

# Not a push -> nothing to do.
printf '%s' "$command_line" | grep -Eq '(^|[;&|(]|[[:space:]])git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+push([[:space:]]|$)' || exit 0

# Case 1: main/master named explicitly, as a branch arg or as the right side of a refspec.
if printf '%s' "$command_line" \
  | grep -Eq '(^|[[:space:]]|:)(refs/heads/)?(main|master)([[:space:]]|$|:)'; then
  deny "Blocked: pushing to main/master is not allowed in this repo. Push to a feature/** or bugfix/** branch and open a PR instead."
fi

# Case 2: no explicit refspec (git push / git push origin / git push -u origin)
# -> the push follows the current branch, so check what that is.
# Arguments after `push`, up to the end of this shell command, minus flags:
push_args=$(printf '%s' "$command_line" \
  | sed -nE 's|.*[[:space:]]push[[:space:]]*||p' \
  | sed -E 's|[;&|].*||' \
  | tr ' ' '\n' | grep -Ev '^(-.*)?$' || true)
# 2+ positional args means remote + refspec was given explicitly; case 1 already
# checked that refspec, so nothing more to do here.
if [[ $(printf '%s\n' "$push_args" | grep -c .) -ge 2 ]]; then
  exit 0
fi

# A `git -C <dir> push ...` targets another repo, so resolve the branch there.
repo_dir=$(printf '%s' "$command_line" | sed -nE 's|.*git[[:space:]]+-C[[:space:]]+([^[:space:]]+).*|\1|p')
repo_dir=${repo_dir:-${CLAUDE_PROJECT_DIR:-$PWD}}
current_branch=$(git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null)
if [[ "$current_branch" == "main" || "$current_branch" == "master" ]]; then
  deny "Blocked: HEAD is on '$current_branch' and this push would target it. Create a feature/** or bugfix/** branch first."
fi

exit 0
