#!/bin/bash
BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="orc-java"
PID_FILE="$BASE_DIR/logs/$APP_NAME.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "$APP_NAME is not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID"
    fi
    echo "$APP_NAME stopped (PID: $PID)"
else
    echo "$APP_NAME was not running (stale PID file)"
fi
rm -f "$PID_FILE"
