#!/bin/bash
BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="orc-java"

echo "Restarting $APP_NAME..."
"$BASE_DIR/scripts/stop.sh"
sleep 2
"$BASE_DIR/scripts/start.sh"
