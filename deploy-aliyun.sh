#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker 未安装，请先安装 Docker。"
  exit 1
fi

if [ ! -f .env ]; then
  echo "[ERROR] 缺少 .env 文件，请先复制 .env.example 为 .env 并填写密码。"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.aliyun.yml --env-file .env up -d --build
else
  docker-compose -f docker-compose.aliyun.yml --env-file .env up -d --build
fi

echo "[OK] 部署完成。请访问: http://$(hostname -I | awk '{print $1}')"
