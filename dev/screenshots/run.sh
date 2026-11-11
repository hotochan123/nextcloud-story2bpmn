#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 hotochan123
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Takes the App Store screenshots with Playwright in a throwaway container (host network, so a
# Nextcloud on localhost is reachable). The image brings the browsers; Playwright itself comes from
# PLAYWRIGHT_MODULES (a node_modules folder with playwright 1.49.1) or is installed into a temp folder.
#
#   dev/screenshots/run.sh <nextcloud url> <user> <password>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[ $# -eq 3 ] || { echo "usage: dev/screenshots/run.sh <nextcloud url> <user> <password>" >&2; exit 2; }
IMAGE=mcr.microsoft.com/playwright:v1.49.1-jammy
if [ -n "${PLAYWRIGHT_MODULES:-}" ]; then
	exec docker run --rm --network host -u "$(id -u):$(id -g)" -v "$PWD:/app" -v "$PLAYWRIGHT_MODULES:/pw/node_modules:ro" -w /app \
		-e PLAYWRIGHT_MODULES=/pw/node_modules "$IMAGE" node dev/screenshots/shoot.mjs "$@"
fi
exec docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/app" -w /app "$IMAGE" sh -c \
	'cd /tmp && npm i --silent --no-save playwright@1.49.1 >/dev/null && cd /app && PLAYWRIGHT_MODULES=/tmp/node_modules node dev/screenshots/shoot.mjs "$@"' sh "$@"
