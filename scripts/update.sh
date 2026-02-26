#!/bin/bash
# Salty OS — Safe Update Script
# Pulls latest code from GitHub, rebuilds container, zero data loss
# Usage: ./scripts/update.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "======================================="
echo "     Salty OS — Safe Update"
echo "======================================="
echo ""

cd "$PROJECT_DIR"

# Step 1: Auto-backup before update
echo "[1/4] Creating pre-update backup..."
mkdir -p "$BACKUP_DIR"
docker cp salty-os:/data/salty-os "$BACKUP_DIR/data_${TIMESTAMP}" 2>/dev/null || echo "  (no running container data to backup)"
git stash save "pre-update-${TIMESTAMP}" 2>/dev/null || true
echo "  Done: backups/data_${TIMESTAMP}"

# Step 2: Pull latest from GitHub
echo ""
echo "[2/4] Pulling latest from GitHub..."
git fetch origin
git pull origin main
echo "  Code updated"

# Step 3: Rebuild container (data volume untouched)
echo ""
echo "[3/4] Rebuilding container..."
docker-compose down
docker-compose build --no-cache
echo "  Container rebuilt"

# Step 4: Restart
echo ""
echo "[4/4] Starting Salty OS..."
docker-compose up -d
echo "  Salty OS is live"

echo ""
echo "======================================="
echo "  Update complete!"
echo "  Data volume: PRESERVED"
echo "  Dashboard: http://localhost:3456"
echo "======================================="
e ps | grep -q "Up"; then
  echo "✅ Salty OS is running!"
  echo ""
  
  # Show version
  NEW_VERSION=$(grep '"version"' package.json | head -1 | grep -o '"[0-9.]*"' | tr -d '"')
  echo "📌 Version: $NEW_VERSION"
else
  echo "❌ Container failed to start. Rolling back..."
  git checkout HEAD~1
  docker compose up -d --build salty-os
  echo "⚠️  Rolled back to previous version."
  echo "Check logs: docker compose logs salty-os"
fi

echo ""
echo "══════════════════════════════"
echo "🧂 Update complete."
echo ""
echo "Your data was NOT touched."
echo "Pre-update backup is in ./backups/"
echo ""
