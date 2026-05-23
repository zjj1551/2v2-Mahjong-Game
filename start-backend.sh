#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/mahjong-server"
LOG_FILE="$ROOT_DIR/mahjong-server.log"
PID_FILE="$ROOT_DIR/mahjong-server.pid"

DB_URL_DEFAULT='jdbc:mysql://127.0.0.1:3306/mahjong_db?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false'
DB_USER_DEFAULT='root'
DB_PASSWORD_DEFAULT='root123'
REDIS_HOST_DEFAULT='127.0.0.1'
REDIS_PORT_DEFAULT='6379'

cd "$SERVER_DIR"

echo "[1/2] 编译后端..."
mvn -q -DskipTests package

JAR_FILE="$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*.original' | head -n 1)"
if [[ -z "$JAR_FILE" ]]; then
  echo "未找到可运行的 jar 包，请先检查 Maven 打包结果。" >&2
  exit 1
fi

LISTENING_LINE="$(ss -ltnp '( sport = :8080 )' 2>/dev/null | tail -n +2 | head -n 1 || true)"
if [[ -n "$LISTENING_LINE" ]]; then
  EXISTING_PID="$(printf '%s\n' "$LISTENING_LINE" | grep -o 'pid=[0-9]\+' | head -n 1 | cut -d= -f2)"
  if [[ -n "$EXISTING_PID" ]] && ps -p "$EXISTING_PID" -o cmd= 2>/dev/null | grep -q 'mahjong-server-1.0.0.jar'; then
    echo "后端已经在运行，PID=$EXISTING_PID"
    echo "日志: $LOG_FILE"
    exit 0
  fi

  echo "8080 端口已被其他进程占用，请先停止该进程或修改端口后再启动。" >&2
  echo "$LISTENING_LINE" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "后端已经在运行，PID=$OLD_PID"
    echo "日志: $LOG_FILE"
    exit 0
  fi
fi

echo "[2/2] 启动后端..."
nohup env \
  DB_URL="${DB_URL:-$DB_URL_DEFAULT}" \
  DB_USER="${DB_USER:-$DB_USER_DEFAULT}" \
  DB_PASSWORD="${DB_PASSWORD:-$DB_PASSWORD_DEFAULT}" \
  REDIS_HOST="${REDIS_HOST:-$REDIS_HOST_DEFAULT}" \
  REDIS_PORT="${REDIS_PORT:-$REDIS_PORT_DEFAULT}" \
  java -jar "$JAR_FILE" \
  > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "后端已启动，PID=$(cat "$PID_FILE")"
echo "日志: $LOG_FILE"
echo "验证: curl -I http://127.0.0.1:8080 | head -n 1"