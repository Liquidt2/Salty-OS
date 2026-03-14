#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Salty OS — Clean Wipe Script
# Removes Salty OS containers, volumes, and images
#
# Usage: bash scripts/clean-wipe.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo ""
echo "🧹 Salty OS — Clean Wipe"
echo "══════════════════════════════════════════"
echo ""
echo "This will DESTROY all Salty OS data:"
echo "  • Containers: salty-os, salty-api, salty-db"
echo "  • Volumes: salty-os-data, salty-os-backups, salty-os-db-data"
echo "  • All built images"
echo ""
read -p "⚠️  Type YES to proceed: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "─── Step 1/3: Stopping & Removing Salty OS Containers ───"
docker compose down -v 2>/dev/null || true
docker rm -f salty-os salty-api salty-db 2>/dev/null || true
echo "✅ Done"

echo ""
echo "─── Step 2/3: Removing Salty OS Volumes ───"
docker volume rm salty-os-data salty-os-backups salty-os-db-data 2>/dev/null || true
echo "✅ Done"

echo ""
echo "─── Step 3/3: Pruning Images ───"
docker image prune -f
echo "✅ Done"

echo ""
echo "══════════════════════════════════════════"
echo "✅ CLEAN WIPE COMPLETE"
echo ""
echo "Next steps:"
echo "  1. git pull"
echo "  2. docker compose up -d --build"
echo ""
