#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/mahjong-server"
LOCAL_MVN="$SERVER_DIR/maven/apache-maven-3.9.6/bin/mvn"

echo "========================================"
echo "Starting Sichuan Mahjong Backend Server..."
echo "Press Ctrl+C to stop."
echo "========================================"

if ! command -v java >/dev/null 2>&1; then
    echo "ERROR: java not found in PATH. Please install JDK first."
    exit 1
fi

if [[ -f "$LOCAL_MVN" ]]; then
    chmod +x "$LOCAL_MVN"
    MVN_CMD="$LOCAL_MVN"
elif command -v mvn >/dev/null 2>&1; then
    MVN_CMD="$(command -v mvn)"
else
    echo "ERROR: Maven not found."
    echo "Please install Maven, or keep the bundled Maven under mahjong-server/maven/."
    exit 1
fi

cd "$SERVER_DIR"
"$MVN_CMD" spring-boot:run &
SERVER_PID=$!

cleanup() {
    if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
    fi
}
trap cleanup INT TERM

for _ in $(seq 1 120); do
    if (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then
        echo
        echo "========================================"
        echo "SUCCESS: Backend server is running on 127.0.0.1:8080"
        echo "========================================"
        break
    fi
    sleep 1
done

wait "$SERVER_PID"
