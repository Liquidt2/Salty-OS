#!/bin/bash
# ═══════════════════════════════════════════
# Salty OS — Backup Script
# Creates a timestamped backup of all data
# Usage: ./scripts/backup.sh
# ═══════════════════════════════════════════

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/salty-os-backup-${TIMESTAMP}.json"

mkdir -p "$BACKUP_DIR"

# Copy data from Docker volume
echo "🧂 Salty OS Backup"
echo "──────────────────────────"

if docker compose ps | grep -q "salty-os"; then
  # Container is running — copy data volume contents
  docker compose exec salty-os cat /app/data/state.json > "$BACKUP_FILE" 2>/dev/null || echo '{"note":"No state file yet — fresh install"}' > "$BACKUP_FILE"
  echo "✅ Backup created: $BACKUP_FILE"
else
  echo "⚠️  Container not running. Backing up local data directory..."
  if [ -f "./data/state.json" ]; then
    cp ./data/state.json "$BACKUP_FILE"
    echo "✅ Backup created: $BACKUP_FILE"
  else
    echo "ℹ️  No data to backup (fresh install)"
  fi
fi

# Show backup size
if [ -f "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "📦 Size: $SIZE"
fi

# Cleanup old backups (keep last 20)
echo ""
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/salty-os-backup-*.json 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 20 ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - 20))
  ls -1t "$BACKUP_DIR"/salty-os-backup-*.json | tail -n "$REMOVE_COUNT" | xargs rm -f
  echo "🧹 Cleaned up $REMOVE_COUNT old backup(s)"
fi

echo "──────────────────────────"
echo "Done."
