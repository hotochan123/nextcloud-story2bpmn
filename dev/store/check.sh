#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 hotochan123
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Store archive probe (the factory check "store-archive"): stages the files an App Store archive of Story2BPMN
# ships, signs them with a THROWAWAY certificate and lets Nextcloud's own `occ integrity:check-app` verify them.
# The user's key is never used or read here; real releases are signed by the release tooling.
#
#   dev/store/check.sh [<app dir>]          # default: this checkout; run `npm run build` first (js/ ships)
#
# 1. stage: the top-level paths of "release.ship" in factory.json (a built-in list when factory.json is absent),
#    without appinfo/signature.json, source maps, sourceMappingURL comments and *.fresh.json; l10n/ only
#    *.js/*.json. Refuses a missing path, a symlink, node_modules, *.key/*.pem/*.csr or private key text.
# 2. openssl makes a throwaway CA and a certificate CN=story2bpmn signed by it, in a temp folder outside the tree.
# 3. one throwaway container (IMAGE, default nextcloud:34-apache, --network none, name story2bpmn-store-<pid>,
#    removed on exit) replaces its own resources/codesigning/root.crt with the throwaway CA, signs the staged
#    copy with `occ integrity:sign-app` and verifies it with `occ integrity:check-app` (which then really checks
#    chain, scope, signature and hashes).
# 4. counter-probes: a changed and an extra file must be reported (INVALID_HASH, EXTRA_FILE), and with
#    Nextcloud's real root the throwaway certificate must be refused. If check-app reports nothing there, the
#    probe is hollow and the check is red.
#
# Env: IMAGE, SKIP_ROOT_SWAP=1 (keep Nextcloud's real root: the check must then fail, a self-test of step 4).
# Output: one line per step (Store <step>: ok … / Store <step>: FAIL …), last line "Store archive <ok>/<failed>".
# Exit: 0 all green, 1 a step failed, 2 docker, openssl or jq missing.
set -euo pipefail
SRC="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")/../..}" && pwd -P)"
APP=story2bpmn
IMAGE="${IMAGE:-nextcloud:34-apache}"
C="story2bpmn-store-$$"
OK=0
FAILED=0
TMP=""
for t in docker openssl jq; do command -v "$t" >/dev/null 2>&1 || { echo "store check: $t missing" >&2; exit 2; }; done

cleanup() {
	local rc=$?
	docker rm -fv "${C:?}" >/dev/null 2>&1 || true
	[ -z "$TMP" ] || rm -rf "${TMP:?}"
	exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

ok() { OK=$((OK + 1)); echo "Store $1: ok${2:+ ($2)}"; }
bad() { FAILED=$((FAILED + 1)); echo "Store $1: FAIL $2"; }
finish() { echo "Store archive $OK/$FAILED"; [ "$FAILED" -eq 0 ]; exit $?; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/story2bpmn-store.XXXXXX")"
ST="$TMP/$APP"
mkdir "$ST"

# ---------------------------------------------------------------- 1. stage
SHIP=()
if [ -f "$SRC/factory.json" ]; then mapfile -t SHIP < <(jq -r '.release.ship[]?' "$SRC/factory.json"); fi
[ "${#SHIP[@]}" -gt 0 ] || SHIP=(appinfo img l10n lib templates js CHANGELOG.md LICENSE README.md)
missing=""
for x in "${SHIP[@]}"; do
	if [[ ! "$x" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then missing+=" $x(not top-level)"; continue; fi
	if [ -e "$SRC/$x" ]; then cp -a "$SRC/$x" "$ST/"; else missing+=" $x"; fi
done
if [ -n "$missing" ]; then bad stage "missing in $SRC:$missing (js/ needs npm run build)"; finish; fi
rm -f "$ST/appinfo/signature.json"
if [ -d "$ST/js" ]; then
	find "$ST/js" -name '*.map' -delete
	find "$ST/js" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.css' \) -exec sed -i -e '/^\/\/# sourceMappingURL=/d' -e 's#/\*\# sourceMappingURL=[^*]*\*/##' {} +
	find "$ST/js" -name '*.fresh.json' -delete
fi
if [ -d "$ST/l10n" ]; then
	find "$ST/l10n" -mindepth 1 \( -name '.*' -o ! \( -name '*.js' -o -name '*.json' \) \) -prune -exec rm -rf {} +
fi
find "$ST" -type d -exec chmod 755 {} +
find "$ST" -type f -exec chmod 644 {} +
ok stage "$(find "$ST" -type f | wc -l) files: ${SHIP[*]}"

forbidden="$(find "$ST" \( -name node_modules -o -name '*.key' -o -name '*.pem' -o -name '*.csr' -o -name '*.map' -o -name '.git' -o -type l \) -printf '%P\n' | head -5)"
if grep -rlI -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' "$ST" >/dev/null 2>&1; then forbidden+=" private-key-text"; fi
if [ -n "$forbidden" ]; then bad forbidden "the archive would contain: $forbidden"; finish; fi
ok forbidden "no keys, links, maps or node_modules"

# ---------------------------------------------------------------- 2. throwaway CA + certificate
K="$TMP/keys"
mkdir -m 700 "$K"
if openssl req -x509 -newkey rsa:2048 -nodes -keyout "$K/ca.key" -out "$K/ca.crt" -days 2 -subj "/CN=Story2BPMN throwaway CA" >/dev/null 2>&1 \
	&& openssl req -newkey rsa:2048 -nodes -keyout "$K/$APP.key" -out "$K/$APP.csr" -subj "/CN=$APP" >/dev/null 2>&1 \
	&& openssl x509 -req -in "$K/$APP.csr" -CA "$K/ca.crt" -CAkey "$K/ca.key" -CAcreateserial -out "$K/$APP.crt" -days 2 >/dev/null 2>&1; then
	ok certificate "throwaway CA, CN=$APP"
else
	bad certificate "openssl could not create the throwaway certificate"; finish
fi

# ---------------------------------------------------------------- 3. sign and verify in a throwaway container
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null 2>&1 || { bad container "image $IMAGE missing"; finish; }
docker run -d --name "$C" --network none --entrypoint sleep "$IMAGE" 900 >/dev/null || { bad container "did not start"; finish; }
NC=/usr/src/nextcloud
occ() { docker exec "$C" php "$NC/occ" "$@"; }
docker exec "$C" mkdir -p /probe/keys /probe/app
docker cp -q "$ST" "$C:/probe/app/" && docker cp -q "$K/$APP.key" "$C:/probe/keys/" && docker cp -q "$K/$APP.crt" "$C:/probe/keys/" \
	&& docker cp -q "$K/ca.crt" "$C:/probe/keys/" || { bad container "copy into the container failed"; finish; }
docker exec "$C" cp "$NC/resources/codesigning/root.crt" /probe/real-root.crt
if [ "${SKIP_ROOT_SWAP:-}" != 1 ]; then docker exec "$C" cp /probe/keys/ca.crt "$NC/resources/codesigning/root.crt"; fi

if out="$(occ integrity:sign-app --path="/probe/app/$APP" --privateKey=/probe/keys/$APP.key --certificate=/probe/keys/$APP.crt 2>&1)" \
	&& docker exec "$C" test -s "/probe/app/$APP/appinfo/signature.json"; then
	ok sign "occ integrity:sign-app wrote appinfo/signature.json"
else
	bad sign "$(tail -n 3 <<<"$out" | tr '\n' ' ')"; finish
fi
docker exec "$C" rm -f /probe/keys/$APP.key
docker exec "$C" cp -a "/probe/app/$APP" /probe/signed

if out="$(occ integrity:check-app --path="/probe/app/$APP" "$APP" 2>&1)"; then
	ok check-app "occ integrity:check-app: no errors"
else
	bad check-app "$(tr '\n' ' ' <<<"$out" | cut -c1-400)"
fi

# ---------------------------------------------------------------- 4. counter-probes
docker exec "$C" sh -c "echo '// changed' >> /probe/app/$APP/appinfo/info.xml && echo extra > /probe/app/$APP/lib/Extra.php"
out="$(occ integrity:check-app --path="/probe/app/$APP" --output=json "$APP" 2>&1 | sed 's#\\/#/#g')" && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && grep -q INVALID_HASH <<<"$out" && grep -q EXTRA_FILE <<<"$out" \
	&& grep -q 'appinfo/info.xml' <<<"$out" && grep -q 'lib/Extra.php' <<<"$out"; then
	ok tamper "a changed and an extra file are reported (INVALID_HASH, EXTRA_FILE)"
else
	bad tamper "check-app did not report the changed and the extra file (exit $rc): $(tr '\n' ' ' <<<"$out" | cut -c1-300)"
fi

docker exec "$C" cp /probe/real-root.crt "$NC/resources/codesigning/root.crt"
out="$(occ integrity:check-app --path=/probe/signed "$APP" 2>&1)" && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && grep -q 'Certificate is not valid' <<<"$out"; then
	ok foreign-root "with Nextcloud's real root the throwaway certificate is refused"
else
	bad foreign-root "check-app accepted a certificate outside Nextcloud's root (exit $rc)"
fi
finish
