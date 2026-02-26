#!/bin/bash
# ═══════════════════════════════════════════
# Salty OS — Restore Script
# Restores data from a backup JSON file
# Usage: ./scripts/restore.sh [backup-file]
# ═══════════════════════════════════════════

set -e

echo ""
echo "🧂 Salty OS — Restore from Backup"
echo "══════════════════════════════════"

BACKUP_DIR="./backups"

if [ -n "$1" ]; then
  BACKUP_FILE="$1"
else
  echo "Available backups:"
  ls -1t "$BACKUP_DIR"/salty-os-backup-*.json 2>/dev/null | head -10 | while read -r f; do
    SIZE=$(du -h "$f" | cut -f1)
    echo "  📦 $f ($SIZE)"
  done
  echo ""
  read -p "Enter backup file path: " BACKUP_FILE
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ File not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from: $BACKUP_FILE"

if docker compose ps | grep -q "salty-os"; then
  docker compose cp "$BACKUP_FILE" salty-os:/app/data/state.json
  echo "✅ Restored. Restart: docker compose restart salty-os"
else
  mkdir -p ./data
  cp "$BACKUP_FILE" ./data/state.json
  echo "✅ Restored. Start: docker compose up -d"
fi
