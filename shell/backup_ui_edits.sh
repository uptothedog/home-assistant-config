#!/bin/sh
# Run nightly by the "Back Up UI Edits" automation (shell_command.backup_ui_edits).
# If automations, scripts or scenes were edited in the HA UI, commit them and
# push to GitHub (main), so the repo matches what is running in HA.
cd /config || exit 1
export GIT_SSH_COMMAND="ssh -i /config/.ssh/id_ed25519 -o UserKnownHostsFile=/config/.ssh/known_hosts -o StrictHostKeyChecking=accept-new"
G="git -c safe.directory=/config -c user.name=HomeAssistant -c user.email=home-assistant@localhost"
FILES="automations.yaml scripts.yaml scenes.yaml"

if $G diff --quiet HEAD -- $FILES; then
  echo "No UI edits."
  exit 0
fi

CHANGED=$($G diff --name-only HEAD -- $FILES | tr '\n' ' ')
$G commit -q -m "UI edits from Home Assistant" -- $FILES || { echo "Commit failed."; exit 1; }

if ! $G pull -q --rebase --autostash; then
  $G rebase --abort 2>/dev/null
  echo "Could not combine with the latest GitHub version; the commit is kept locally."
  exit 1
fi

$G push -q origin HEAD:main || { echo "Push to GitHub failed."; exit 1; }
echo "Backed up: $CHANGED"
