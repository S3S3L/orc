#!/bin/bash
BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="orc-java"
MODE="${MODE:-serve}"

echo "Restarting $APP_NAME in $MODE mode..."
"$BASE_DIR/scripts/stop.sh"
sleep 2
MODE="$MODE" WORKFLOW="${WORKFLOW:-}" SERVER_PORT="${SERVER_PORT:-30080}" \
    OUTPUT="${OUTPUT:-./output}" WORKSPACE="${WORKSPACE:-./workspace}" AUDIT="${AUDIT:-./audit}" \
    "$BASE_DIR/scripts/start.sh"
