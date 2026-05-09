#!/bin/bash
BASE_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_NAME="orc-java"
PID_FILE="$BASE_DIR/logs/$APP_NAME.pid"
LOG_FILE="$BASE_DIR/logs/$APP_NAME.log"
SERVER_PORT="${SERVER_PORT:-30080}"
MODE="${MODE:-serve}"

mkdir -p "$BASE_DIR/logs"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "$APP_NAME is already running (PID: $(cat "$PID_FILE"))"
    exit 0
fi

JAR_FILE=$(ls "$BASE_DIR"/target/orc-java-*.jar 2>/dev/null | grep -v '.original' | head -1)

NEED_BUILD=false
if [ -z "$JAR_FILE" ]; then
    NEED_BUILD=true
elif [ -n "$JAR_FILE" ]; then
    # Rebuild if source files or static assets are newer than JAR
    NEWER_SOURCES=$(find "$BASE_DIR/src" -newer "$JAR_FILE" 2>/dev/null | head -1)
    NEWER_POM=$(find "$BASE_DIR/pom.xml" -newer "$JAR_FILE" 2>/dev/null | head -1)
    if [ -n "$NEWER_SOURCES" ] || [ -n "$NEWER_POM" ]; then
        NEED_BUILD=true
    fi
fi

if [ "$NEED_BUILD" = true ]; then
    echo "Building project..."
    cd "$BASE_DIR" && mvn package -DskipTests -q
    JAR_FILE=$(ls "$BASE_DIR"/target/orc-java-*.jar 2>/dev/null | grep -v '.original' | head -1)
fi

if [ -z "$JAR_FILE" ]; then
    echo "Failed to build JAR file"
    exit 1
fi

cd "$BASE_DIR"

if [ "$MODE" = "run" ]; then
    if [ -z "$WORKFLOW" ]; then
        echo "Error: WORKFLOW env is required for run mode"
        exit 1
    fi
    nohup java -jar "$JAR_FILE" run \
        --workflow "$WORKFLOW" \
        --output "${OUTPUT:-./output}" \
        --workspace "${WORKSPACE:-./workspace}" \
        --audit "${AUDIT:-./audit}" \
        > "$LOG_FILE" 2>&1 &
else
    nohup java -jar "$JAR_FILE" \
        --server.port="$SERVER_PORT" \
        --spring.shell.noninteractive.enabled=false \
        > "$LOG_FILE" 2>&1 &
fi

echo $! > "$PID_FILE"
echo "$APP_NAME started in $MODE mode (PID: $!) on port $SERVER_PORT"
