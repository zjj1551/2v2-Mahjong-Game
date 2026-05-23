#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "未找到 docker compose 或 docker-compose，请先安装 Docker。" >&2
  exit 1
fi

"${COMPOSE_CMD[@]}" up -d --build backend frontend

echo "前后端容器已重启。"
echo "前端: http://127.0.0.1:8081"
