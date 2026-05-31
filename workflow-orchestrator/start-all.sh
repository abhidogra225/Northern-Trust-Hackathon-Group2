#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS=()

log() {
  printf "\n[%s] %s\n" "$(date +'%H:%M:%S')" "$1"
}

cleanup() {
  log "Stopping all background processes..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait || true
  log "Shutdown complete."
}

trap cleanup INT TERM EXIT

postgres_is_ready() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h localhost -p 5432 >/dev/null 2>&1
    return $?
  fi
  nc -z localhost 5432 >/dev/null 2>&1
}

check_postgres() {
  log "Checking PostgreSQL availability on localhost:5432..."
  if postgres_is_ready; then
    log "PostgreSQL is reachable."
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    log "PostgreSQL not running. Starting Docker database service..."
    (cd "${ROOT_DIR}" && docker compose up -d db)
    sleep 4
  fi

  if ! postgres_is_ready; then
    echo "PostgreSQL is not reachable on localhost:5432."
    echo "Start Docker Desktop and run: docker compose up -d db"
    exit 1
  fi

  log "PostgreSQL is reachable."
}

start_service() {
  local name="$1"
  local dir="$2"
  local command="$3"

  log "Starting ${name}..."
  (
    cd "$dir"
    eval "$command"
  ) &
  local pid=$!
  PIDS+=("$pid")
  log "${name} started (pid: ${pid})"
}

ensure_env() {
  if [ ! -f "${ROOT_DIR}/orchestrator/.env" ]; then
    log "Creating orchestrator/.env from .env.example..."
    cp "${ROOT_DIR}/orchestrator/.env.example" "${ROOT_DIR}/orchestrator/.env"
    sed -i '' 's|@db:5432|@localhost:5432|g' "${ROOT_DIR}/orchestrator/.env" 2>/dev/null || \
      sed -i 's|@db:5432|@localhost:5432|g' "${ROOT_DIR}/orchestrator/.env"
  fi
}

main() {
  ensure_env
  check_postgres

  start_service "payment-service" "${ROOT_DIR}/services/payment-service" "PORT=4001 npm start"
  start_service "inventory-service" "${ROOT_DIR}/services/inventory-service" "PORT=4002 npm start"
  start_service "shipping-service" "${ROOT_DIR}/services/shipping-service" "PORT=4003 npm start"
  start_service "notification-service" "${ROOT_DIR}/services/notification-service" "PORT=4004 npm start"
  start_service "orchestrator" "${ROOT_DIR}/orchestrator" "npm start"
  start_service "frontend" "${ROOT_DIR}/frontend" "npm run dev"

  sleep 3
  log "Resetting demo inventory levels..."
  curl -sf -X POST http://127.0.0.1:4002/admin/reset-inventory >/dev/null 2>&1 || true
  log "Opening frontend in browser..."
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173" || true
  fi

  log "All services started. Press Ctrl+C to stop everything."
  wait
}

main
