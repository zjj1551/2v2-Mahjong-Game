#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_DELETE=false

if [[ "${1:-}" == "--apply" ]]; then
    APPLY_DELETE=true
fi

WINDOWS_ONLY_FILES=(
    "启动后台服务.bat"
    "mahjong-server/mvnw.cmd"
    "mahjong-server/maven/apache-maven-3.9.6/bin/mvn.cmd"
    "mahjong-server/maven/apache-maven-3.9.6/bin/mvnDebug.cmd"
)

echo "Windows-only file check:"
for file in "${WINDOWS_ONLY_FILES[@]}"; do
    abs_path="$ROOT_DIR/$file"
    if [[ -f "$abs_path" ]]; then
        if [[ "$APPLY_DELETE" == true ]]; then
            rm -f "$abs_path"
            echo "[deleted] $file"
        else
            echo "[found]   $file"
        fi
    fi
done

if [[ "$APPLY_DELETE" == false ]]; then
    echo
    echo "Dry-run only. Use this command to delete found files:"
    echo "  ./cleanup-windows-files.sh --apply"
fi
