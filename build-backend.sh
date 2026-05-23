#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/mahjong-server"

echo "正在编译后端..."
mvn -q -DskipTests package

echo "编译完成"