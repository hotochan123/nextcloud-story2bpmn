#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 hotochan123
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Integration run for Story2BPMN: starts a throwaway Nextcloud (SQLite, PostgreSQL, MariaDB or MySQL, with
# Redis for cache and file locking; no published port), installs the app from this checkout and runs
# dev/it/scenarios.mjs against its file API and WebDAV. Result lines on stdout:
#   FAIL <db>: <label>                 one per failed check
#   Integration <db> <ok>/<failed>     per database
#   Integration <ok>/<failed>          last line with DB=all: the sum
# Exit 0 without failures, 1 with at least one, 2 when the run could not be set up.
# Diagnostics (what is happening right now) go to stderr.
#
# Environment:
#   DB=sqlite                    sqlite (default), pgsql, mariadb, mysql, or all = the four in parallel
#   IMAGE=nextcloud:34-apache    Nextcloud image
#   APP_SRC=<checkout>           source of the app (default: the checkout of this script)
#   KEEP=1                       leave containers and the work directory in place
#   STORY2BPMN_IT_PREFIX=story2bpmn-it- container prefix (the process id is appended)
#
# Never against the production instance: the runner only ever creates and removes its own containers
# <prefix><pid>, <prefix><pid>-db and <prefix><pid>-redis.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DB="${DB:-sqlite}"
case "$DB" in sqlite | pgsql | mariadb | mysql | all) ;; *) echo "DB must be sqlite, pgsql, mariadb, mysql or all" >&2; exit 2 ;; esac
IMAGE="${IMAGE:-nextcloud:34-apache}"
APP_SRC="$(cd "${APP_SRC:-$REPO}" && pwd)"
KEEP="${KEEP:-0}"
PREFIX="${STORY2BPMN_IT_PREFIX:-story2bpmn-it-}"
[[ "$PREFIX" =~ ^[a-z0-9][a-z0-9_.-]*$ ]] || { echo "STORY2BPMN_IT_PREFIX must be a container name prefix" >&2; exit 2; }
C="$PREFIX$$"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/story2bpmn-it.XXXXXX")"
STARTED=$SECONDS
pw() { head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20; }
ADMIN_PW="$(pw)"
USER_PW="$(pw)"
DB_PW="$(pw)"
REDIS_PW="$(pw)"
USERS=(alice bob)

info() { echo "  · [$DB] $*" >&2; }

cleanup() {
	local rc=$?
	if [[ "$DB" == all ]]; then
		:
	elif [[ "$KEEP" == 1 ]]; then
		echo "KEEP=1: containers $C, $C-redis (and $C-db) are kept" >&2
	else
		docker rm -fv "$C" "$C-db" "$C-redis" >/dev/null 2>&1 || true
	fi
	if [[ "$KEEP" != 1 && $rc -eq 0 ]]; then
		rm -rf "${WORK:?}"
	else
		echo "Run outputs: $WORK" >&2
	fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

occ() { docker exec -u www-data "$C" php occ "$@"; }
ip_of() { docker inspect "$1" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}'; }

build_js_if_needed() {
	compgen -G "$APP_SRC/js/*.js" >/dev/null && return 0
	echo "  · js/ has no bundles: npm run build" >&2
	(cd "$APP_SRC" && npm run build) >"$WORK/js-build.txt" 2>&1 \
		|| { echo "js build failed, see $WORK/js-build.txt" >&2; exit 2; }
}

# Database and Redis containers, reached through a legacy --link on the default bridge: no
# network of its own (the host's address pools are nearly used up). Sets NC_ARGS for Nextcloud.
start_backends() {
	local i
	docker run -d --name "$C-redis" redis:7-alpine redis-server --requirepass "$REDIS_PW" >/dev/null
	NC_ARGS=(--link "$C-redis" -e REDIS_HOST="$C-redis" -e REDIS_HOST_PASSWORD="$REDIS_PW")
	case "$DB" in
	sqlite)
		NC_ARGS+=(-e SQLITE_DATABASE=nextcloud)
		return 0 ;;
	pgsql)
		info "starting postgres"
		docker run -d --name "$C-db" \
			-e POSTGRES_DB=nextcloud -e POSTGRES_USER=nextcloud -e POSTGRES_PASSWORD="$DB_PW" postgres:17-alpine >/dev/null
		NC_ARGS+=(--link "$C-db" -e POSTGRES_HOST="$C-db" -e POSTGRES_DB=nextcloud -e POSTGRES_USER=nextcloud -e POSTGRES_PASSWORD="$DB_PW")
		# via TCP: during its init the image runs a temporary server on the socket only
		for i in $(seq 1 120); do
			docker exec "$C-db" pg_isready -h 127.0.0.1 -U nextcloud >/dev/null 2>&1 && return 0
			sleep 1
		done ;;
	mariadb | mysql)
		local img=mariadb:11.8 pre=MARIADB admin=mariadb-admin
		[[ "$DB" == mysql ]] && { img=mysql:8.4; pre=MYSQL; admin=mysqladmin; }
		info "starting $img"
		docker run -d --name "$C-db" \
			-e "${pre}_DATABASE=nextcloud" -e "${pre}_USER=nextcloud" -e "${pre}_PASSWORD=$DB_PW" -e "${pre}_RANDOM_ROOT_PASSWORD=1" \
			"$img" --transaction-isolation=READ-COMMITTED --binlog-format=ROW >/dev/null
		NC_ARGS+=(--link "$C-db" -e MYSQL_HOST="$C-db" -e MYSQL_DATABASE=nextcloud -e MYSQL_USER=nextcloud -e MYSQL_PASSWORD="$DB_PW")
		# via TCP: during its init the image runs a temporary server without networking
		for i in $(seq 1 120); do
			docker exec "$C-db" "$admin" ping -h127.0.0.1 --protocol=tcp -unextcloud -p"$DB_PW" --silent >/dev/null 2>&1 && return 0
			sleep 1
		done ;;
	esac
	echo "database $C-db did not come up" >&2
	exit 2
}

start_nc() {
	local i
	start_backends
	info "starting $C from $IMAGE"
	docker run -d --name "$C" "${NC_ARGS[@]}" \
		-e NEXTCLOUD_ADMIN_USER=admin -e NEXTCLOUD_ADMIN_PASSWORD="$ADMIN_PW" \
		-e NEXTCLOUD_TRUSTED_DOMAINS=localhost \
		"$IMAGE" >/dev/null
	for i in $(seq 1 180); do
		if occ status --output=json 2>/dev/null | grep -q '"installed":true'; then
			# installation finished does not yet mean Apache is already answering
			docker exec "$C" curl -sf -o /dev/null http://localhost/status.php && return 0
		fi
		sleep 2
	done
	echo "Nextcloud in $C did not come up" >&2
	exit 2
}

install_app() {
	info "copying app from $APP_SRC"
	# only what runs on the server, as in the release archive
	tar -C "$APP_SRC" --exclude=./node_modules --exclude=./vendor --exclude=./src --exclude=./dev --exclude=./tests \
		--exclude=./.git --exclude=./build --exclude=./factory --exclude=./docs --exclude='*.map' -cf - . \
		| docker exec -i "$C" sh -c 'rm -rf /var/www/html/custom_apps/story2bpmn && mkdir -p /var/www/html/custom_apps/story2bpmn \
			&& tar -xf - -C /var/www/html/custom_apps/story2bpmn && chown -R www-data:www-data /var/www/html/custom_apps/story2bpmn'
	occ app:enable story2bpmn >"$WORK/app-enable.txt" 2>&1 || { cat "$WORK/app-enable.txt" >&2; exit 2; }
}

add_user() { # uid group
	docker exec -u www-data -e OC_PASS="$USER_PW" "$C" php occ user:add --password-from-env --display-name="IT $1" ${2:+--group="$2"} "$1" >/dev/null
	occ user:setting "$1" core lang en >/dev/null
}

setup() {
	start_nc
	occ background:cron >/dev/null
	occ config:system:set has_internet_connection --value=false --type=boolean >/dev/null
	occ config:system:set appstoreenabled --value=false --type=boolean >/dev/null
	occ config:system:set default_language --value=en >/dev/null
	install_app
	add_user alice
	add_user bob
}

# Right after app:enable the web server may still answer the app's routes with 404 for a few seconds.
# Wait until an anonymous request to the file API is refused (401) instead. The probe sends its own
# Host header (with a port, which the trusted_domains check ignores): Nextcloud caches the routes per
# Host header, and the scenarios' "localhost" must not get a cached route table without Story2BPMN.
wait_routes() {
	local i code
	for i in $(seq 1 60); do
		code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: localhost:1' -H 'OCS-APIRequest: true' "http://$1/index.php/apps/story2bpmn/api/files/1" || true)
		[[ "$code" == 401 ]] && { info "routes ready after $i probe(s)"; return 0; }
		sleep 2
	done
	echo "the app's routes did not come up (last HTTP $code)" >&2
	exit 2
}

# Turns the scenarios' output ($1) into the result lines of database $2; returns 1 on a failure
report() {
	local out="$1" db="$2" line ok failed
	line=$(grep -E '^==== [0-9]+ ok / [0-9]+ fehlgeschlagen ====$' "$out" | tail -n1 || true)
	if [[ -z "$line" ]]; then
		echo "FAIL $db: scenarios ended without totals: $( (grep -E -m1 'Error' "$out" || grep -v '^[[:space:]]*$' "$out" | tail -n1) || true)"
		echo "Integration $db 0/1"
		return 1
	fi
	read -r ok failed <<<"$(sed -E 's/^==== ([0-9]+) ok \/ ([0-9]+) fehlgeschlagen ====$/\1 \2/' <<<"$line")"
	# the failure list follows the totals line: " - <label>"
	sed -n '/^==== [0-9]* ok \/ [0-9]* fehlgeschlagen ====$/,$p' "$out" | sed -nE "s/^ - (.*)$/FAIL $db: \1/p"
	echo "Integration $db $ok/$failed"
	[[ "$failed" == 0 ]]
}

run_one() {
	local ip rc=0
	setup
	ip="$(ip_of "$C")"
	wait_routes "$ip"
	info "Nextcloud up after $((SECONDS - STARTED)) s, scenarios against $ip"
	STORY2BPMN_IT_URL="http://$ip" STORY2BPMN_IT_CONTAINER="$C" \
		STORY2BPMN_IT_ADMIN_PASS="$ADMIN_PW" STORY2BPMN_IT_PASS="$USER_PW" STORY2BPMN_IT_USERS="${USERS[*]}" \
		node "$HERE/scenarios.mjs" >"$WORK/scenarios.txt" 2>&1 || true
	report "$WORK/scenarios.txt" "$DB" || rc=1
	info "runtime $((SECONDS - STARTED)) s, image $IMAGE, app from $APP_SRC"
	return $rc
}

# DB=all: the four databases in parallel, each a child run of this script with its own prefix and log;
# their lines in a fixed order, then the sum. A child without a result line counts as one failure.
run_all() {
	local d pids=() line ok failed tok=0 tfail=0
	build_js_if_needed
	trap 'kill "${pids[@]}" 2>/dev/null || true; wait; exit 130' INT TERM
	for d in sqlite pgsql mariadb mysql; do
		DB=$d STORY2BPMN_IT_PREFIX="$C-$d-" "${BASH_SOURCE[0]}" >"$WORK/$d.out" 2>"$WORK/$d.err" &
		pids+=($!)
	done
	echo "  · four runs in parallel (logs in $WORK/<db>.err)" >&2
	for d in "${pids[@]}"; do wait "$d" || true; done
	for d in sqlite pgsql mariadb mysql; do
		grep -E "^FAIL $d: " "$WORK/$d.out" || true
		line=$(grep -E "^Integration $d [0-9]+/[0-9]+$" "$WORK/$d.out" | tail -n1 || true)
		if [[ -z "$line" ]]; then
			echo "FAIL $d: setup failed: $(grep -v -e "^Run outputs: " -e "^KEEP=1: " "$WORK/$d.err" 2>/dev/null | tail -n1 || true)"
			echo "Integration $d 0/1"
			tfail=$((tfail + 1))
			continue
		fi
		echo "$line"
		IFS=/ read -r ok failed <<<"${line##* }"
		tok=$((tok + ok)); tfail=$((tfail + failed))
	done
	echo "  · runtime $((SECONDS - STARTED)) s, image $IMAGE, app from $APP_SRC" >&2
	echo "Integration $tok/$tfail"
	[[ "$tfail" == 0 ]]
}

if [[ "$DB" == all ]]; then
	run_all
	exit
fi
build_js_if_needed
run_one
