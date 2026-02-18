#!/usr/bin/env bash
# Trenchable API — VPS deployment script
# Usage:
#   First deploy:  ./deploy.sh setup
#   Re-deploy:     ./deploy.sh update
#
# Requires: git, docker, docker compose (v2) on the VPS
# Run as a non-root user with docker group membership

set -euo pipefail

APP_DIR="/opt/trenchable"
REPO_URL="https://github.com/trenchabledevs/trenchable.git"
BRANCH="master"
IMAGE_NAME="trenchable-api"
CONTAINER_NAME="trenchable-api"
DATA_DIR="/opt/trenchable-data"

# -------------------------------------------------------
# Helpers
# -------------------------------------------------------
info()  { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[0;32m[ OK ]\033[0m  $*"; }
die()   { echo -e "\033[0;31m[FAIL]\033[0m  $*"; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "$1 is required but not installed."
}

# -------------------------------------------------------
# setup: first-time VPS bootstrap
# -------------------------------------------------------
cmd_setup() {
  info "Setting up Trenchable API on this VPS..."

  require git
  require docker

  # Create data dir (persists SQLite across deploys)
  sudo mkdir -p "$DATA_DIR"
  sudo chown "$(whoami)":"$(whoami)" "$DATA_DIR"
  ok "Data directory: $DATA_DIR"

  # Clone repo
  if [ -d "$APP_DIR" ]; then
    info "Repo already exists at $APP_DIR — pulling instead"
    git -C "$APP_DIR" pull origin "$BRANCH"
  else
    sudo mkdir -p "$APP_DIR"
    sudo chown "$(whoami)":"$(whoami)" "$APP_DIR"
    git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
  ok "Source at $APP_DIR"

  # Create .env if missing
  if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/deploy/.env.production.template" "$APP_DIR/.env"
    echo ""
    echo "  ⚠  Created $APP_DIR/.env from template."
    echo "  ⚠  EDIT IT NOW before starting the container:"
    echo "     nano $APP_DIR/.env"
    echo ""
  fi

  cmd_build
  cmd_start

  ok "Setup complete. Run './deploy.sh logs' to watch startup."
}

# -------------------------------------------------------
# update: pull latest code and rebuild
# -------------------------------------------------------
cmd_update() {
  info "Pulling latest code..."
  git -C "$APP_DIR" pull origin "$BRANCH"

  cmd_build
  cmd_restart
  ok "Update complete."
}

# -------------------------------------------------------
# build: build Docker image
# -------------------------------------------------------
cmd_build() {
  info "Building Docker image..."
  docker build -t "$IMAGE_NAME" "$APP_DIR"
  ok "Image built: $IMAGE_NAME"
}

# -------------------------------------------------------
# start: start container (first time)
# -------------------------------------------------------
cmd_start() {
  info "Starting container..."
  # Stop existing if any
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:3001:3001 \
    -v "$DATA_DIR:/app/apps/api/data" \
    --env-file "$APP_DIR/.env" \
    "$IMAGE_NAME"

  ok "Container started: $CONTAINER_NAME"
}

# -------------------------------------------------------
# restart: zero-downtime restart after update
# -------------------------------------------------------
cmd_restart() {
  info "Restarting container..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  cmd_start
}

# -------------------------------------------------------
# logs: tail container logs
# -------------------------------------------------------
cmd_logs() {
  docker logs -f --tail=100 "$CONTAINER_NAME"
}

# -------------------------------------------------------
# status: show container status
# -------------------------------------------------------
cmd_status() {
  docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# -------------------------------------------------------
# Dispatch
# -------------------------------------------------------
case "${1:-help}" in
  setup)   cmd_setup ;;
  update)  cmd_update ;;
  build)   cmd_build ;;
  start)   cmd_start ;;
  restart) cmd_restart ;;
  logs)    cmd_logs ;;
  status)  cmd_status ;;
  *)
    echo "Usage: $0 {setup|update|build|start|restart|logs|status}"
    exit 1
    ;;
esac
