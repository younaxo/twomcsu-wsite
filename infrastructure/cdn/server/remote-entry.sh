#!/usr/bin/env bash
# СЕРВЕР (через `ssh ... 'bash -s -- <id> <setup|sync>' < remote-entry.sh`): распаковать бандл ~/.twomc-inbox/twomc-cdn-<id>.tar и выполнить действие.
# Бандл: ops/ (cdn-setup.sh, cdn-apply.sh, cdn-files-backup.sh, *.template), для sync - files.tar.gz и files.sha256.
set -euo pipefail
ID="${1:?id}"; ACTION="${2:?action}"
[[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
[[ "$ACTION" =~ ^(setup|sync)$ ]] || { echo "Недопустимое действие" >&2; exit 2; }
B="$HOME/.twomc-inbox/twomc-cdn-$ID.tar"
[[ -f "$B" ]] || { echo "Нет бандла $B" >&2; exit 3; }
W="$(mktemp -d /tmp/twomc-cdn-work.XXXXXX)"
trap 'rm -rf "$W" "$B"' EXIT
tar -xf "$B" -C "$W"
case "$ACTION" in
  setup) bash "$W/ops/cdn-setup.sh" "$W" ;;
  sync)  bash "$W/ops/cdn-apply.sh" "$W" ;;
esac
