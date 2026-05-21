#!/usr/bin/env bash
#
# autoblogtool deploy helper.
#
# Usage:
#   ./deploy.sh             # full build + restart cycle
#   ./deploy.sh --no-build  # skip the build step, just restart pm2
#
# What it does:
#   1. Stops the pm2 process (frees .next file handles)
#   2. Wipes .next so the build is reproducible
#   3. Runs `next build` under Node 20 via fnm
#   4. Restarts the pm2 process (which runs `next start -p 5025`)
#   5. Waits for port 5025 to listen, then curls /admin and /api/settings
#      to confirm both pages return HTTP 200.
#
# Designed to fail loud — any step that errors aborts the script with a
# non-zero exit code so CI / cron / a human sees the failure clearly.

set -euo pipefail

# ─── colors ─────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
else
  RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""
fi

# ─── paths ──────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PM2_NAME="autoblogtool"
PORT="5025"
HEALTH_PATHS=("/admin" "/api/settings")

NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *)
      echo "${RED}unknown flag: $arg${RESET}" >&2; exit 2 ;;
  esac
done

log()   { printf '%s▸%s %s\n' "$BOLD" "$RESET" "$*"; }
ok()    { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%s⚠%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()   { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# ─── sanity checks ──────────────────────────────────────────────────────────
[ -d "$FRONTEND_DIR" ] || die "frontend dir not found at $FRONTEND_DIR"
command -v fnm >/dev/null || die "fnm not in PATH — needed to pin Node 20"
command -v pm2 >/dev/null || die "pm2 not in PATH"

NODE_BIN="$(fnm exec --using=20 which node)"
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[ -x "$NODE_BIN" ] || die "Node 20 not installed under fnm — run 'fnm install 20'"
[ -x "$NPM_BIN" ]  || die "npm not found alongside Node 20"

log "Node:  $($NODE_BIN --version)"
log "npm:   $($NPM_BIN --version)"
log "pm2:   $(pm2 --version)"
log "Build: $([ "$NO_BUILD" = "1" ] && echo skip || echo full)"

# ─── step 1: stop pm2 (so .next file handles release) ───────────────────────
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "Stopping pm2 process '$PM2_NAME'…"
  pm2 stop "$PM2_NAME" >/dev/null
  # Give the OS a moment to flush write handles before we delete .next.
  sleep 2
  ok "Stopped."
else
  warn "pm2 process '$PM2_NAME' not found — will start fresh after build."
fi

# ─── step 2 + 3: clean + build ──────────────────────────────────────────────
if [ "$NO_BUILD" = "0" ]; then
  log "Cleaning .next …"
  rm -rf "$FRONTEND_DIR/.next"
  ok "Cleaned."

  log "Running 'next build' under Node 20…"
  ( cd "$FRONTEND_DIR" && PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" run build )
  ok "Build succeeded."
fi

# ─── step 4: recreate pm2 entry from scratch ────────────────────────────────
#
# We DELETE + START rather than RESTART because pm2 restart preserves the
# stored exec config but not the shell env that was active at first launch.
# That meant our PATH override (which puts Node 20 ahead of the system's
# Node 18) was lost on every restart, and npm would resolve to Node 18 and
# refuse to run Next.js 16 with "Node.js version >=20.9.0 is required".
# Delete-and-recreate is a tiny bit slower (~1s) but always uses the right
# Node, which is what we want for an idempotent deploy script.
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "Removing existing pm2 entry '$PM2_NAME'…"
  pm2 delete "$PM2_NAME" >/dev/null
fi

log "Starting pm2 process '$PM2_NAME' (binds to port $PORT) under Node 20…"
PATH="$(dirname "$NODE_BIN"):$PATH" \
  pm2 start "$NPM_BIN" \
    --name "$PM2_NAME" \
    --cwd "$FRONTEND_DIR" \
    --interpreter=none \
    -- run start >/dev/null

# Persist the process list so a future 'pm2 resurrect' (and the systemd
# unit registered by 'pm2 startup') brings everything back automatically.
pm2 save >/dev/null
ok "pm2 process started + list saved."

# ─── step 5: health check ───────────────────────────────────────────────────
log "Waiting for port $PORT to listen…"
for i in $(seq 1 60); do
  if ss -tln 2>/dev/null | grep -q ":$PORT "; then
    ok "Port $PORT is listening."
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then
    pm2 logs "$PM2_NAME" --lines 30 --nostream || true
    die "Timed out waiting for port $PORT after 60s. See logs above."
  fi
done

ALL_OK=1
for p in "${HEALTH_PATHS[@]}"; do
  http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "http://localhost:$PORT$p" || echo "000")
  if [ "$http" = "200" ]; then
    ok "GET $p → HTTP $http"
  else
    warn "GET $p → HTTP $http"
    ALL_OK=0
  fi
done

if [ "$ALL_OK" = "1" ]; then
  ok "Deploy complete."
else
  warn "Deploy is up but some endpoints returned non-200. Inspect 'pm2 logs $PM2_NAME'."
  exit 1
fi
