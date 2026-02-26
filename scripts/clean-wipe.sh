#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# BKE LOGISTICS — Clean Wipe Script
# Removes ALL containers, volumes, images, networks
# EXCEPT Nginx Proxy Manager and its data
#
# Usage: bash scripts/clean-wipe.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo ""
echo "🧹 BKE LOGISTICS — Clean Wipe"
echo "══════════════════════════════════════════"
echo ""
echo "This will DESTROY everything except Nginx Proxy Manager:"
echo "  • All containers (agent_zero, n8n, postiz, postgres, redis, etc.)"
echo "  • All volumes (databases, n8n data, agent memory, etc.)"
echo "  • All images"
echo "  • All networks (except bridge/host/none)"
echo ""
echo "Nginx Proxy Manager will be PRESERVED (container + data)."
echo ""
read -p "⚠️  Type YES to proceed: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "─── Step 1/6: Identifying Proxy Manager ───"

# Find proxy manager container ID and volume
PM_CONTAINER=$(docker ps -a --filter "name=proxy_manager" --format "{{.ID}}" 2>/dev/null || true)
PM_VOLUMES=$(docker inspect proxy_manager --format '{{range .Mounts}}{{.Name}} {{end}}' 2>/dev/null || true)

if [ -n "$PM_CONTAINER" ]; then
  echo "✅ Found proxy_manager: $PM_CONTAINER"
  echo "   Volumes to keep: $PM_VOLUMES"
else
  echo "⚠️  proxy_manager not found — proceeding anyway"
fi

echo ""
echo "─── Step 2/6: Stopping all containers except proxy_manager ───"

# Get all container IDs except proxy_manager
CONTAINERS=$(docker ps -aq --filter "name!=proxy_manager" 2>/dev/null || true)
if [ -n "$CONTAINERS" ]; then
  echo "Stopping and removing $(echo "$CONTAINERS" | wc -w) containers..."
  docker stop $CONTAINERS 2>/dev/null || true
  docker rm -f $CONTAINERS 2>/dev/null || true
  echo "✅ Done"
else
  echo "No containers to remove"
fi

echo ""
echo "─── Step 3/6: Removing volumes (except proxy_manager) ───"

# Get all volumes except proxy manager's
ALL_VOLUMES=$(docker volume ls -q 2>/dev/null || true)
for VOL in $ALL_VOLUMES; do
  SKIP=false
  for PM_VOL in $PM_VOLUMES; do
    if [ "$VOL" = "$PM_VOL" ]; then
      SKIP=true
      echo "  ⏭️  Keeping: $VOL (proxy_manager)"
      break
    fi
  done
  # Also keep volumes with "proxy" or "npm" in name as safety net
  if echo "$VOL" | grep -qi "proxy\|npm\|nginx"; then
    SKIP=true
    echo "  ⏭️  Keeping: $VOL (proxy-related)"
  fi
  if [ "$SKIP" = false ]; then
    docker volume rm "$VOL" 2>/dev/null && echo "  🗑️  Removed: $VOL" || echo "  ⚠️  Skipped (in use): $VOL"
  fi
done

echo ""
echo "─── Step 4/6: Removing images ───"

docker image prune -a -f 2>/dev/null
echo "✅ Images cleaned"

echo ""
echo "─── Step 5/6: Removing networks ───"

# Remove all custom networks except default ones
NETWORKS=$(docker network ls --filter "type=custom" -q 2>/dev/null || true)
for NET in $NETWORKS; do
  NET_NAME=$(docker network inspect "$NET" --format '{{.Name}}' 2>/dev/null || true)
  # Keep proxy-related networks
  if echo "$NET_NAME" | grep -qi "proxy\|npm\|nginx"; then
    echo "  ⏭️  Keeping: $NET_NAME (proxy-related)"
  else
    docker network rm "$NET" 2>/dev/null && echo "  🗑️  Removed: $NET_NAME" || echo "  ⚠️  Skipped: $NET_NAME"
  fi
done

echo ""
echo "─── Step 6/6: Removing old compose projects ───"

# Clean up any leftover compose project dirs
rm -rf /opt/docker-stack 2>/dev/null || true
rm -rf /opt/agent-zero 2>/dev/null || true
rm -rf /opt/n8n 2>/dev/null || true
rm -rf /opt/postiz 2>/dev/null || true

echo ""
echo "══════════════════════════════════════════"
echo "✅ CLEAN WIPE COMPLETE"
echo ""
echo "What's left:"
docker ps --format "  {{.Names}}\t{{.Status}}"
echo ""
echo "Volumes kept:"
docker volume ls --format "  {{.Name}}"
echo ""
echo "Next steps:"
echo "  1. cd /opt"
echo "  2. git clone https://github.com/Liquidt2/Salty-OS.git"
echo "  3. cd Salty-OS"
echo "  4. cp .env.example .env && nano .env"
echo "  5. docker compose -f docker-stack.yml up -d --build"
echo ""
