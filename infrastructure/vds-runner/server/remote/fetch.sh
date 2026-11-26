#!/usr/bin/env bash
# СЕРВЕР (через `ssh ... 'bash -s -- <id>' < fetch.sh`): отдать итог задания одним tar.gz в stdout (result.env, summary.txt, job.log).
set -euo pipefail
ID="${1:?id}"
[[ "$ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+-[a-f0-9]{6}$ ]] || { echo "Недопустимый id" >&2; exit 2; }
D="/srv/twomc-runner/done/$ID"
[[ -d "$D" ]] || { echo "Нет результата для $ID" >&2; exit 3; }
tar -czf - -C "$D" result.env summary.txt job.log
