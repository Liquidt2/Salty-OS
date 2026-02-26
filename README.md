# 🧂 Salty OS

**BKE Logistics × Agent Zero Command Center**

Unified operations dashboard + full backend infrastructure for managing AI agents, tasks, and business operations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ops.bkelogistics.com     │  klaus.bkelogistics.com         │
│  ┌──────────┐  ┌────────┐ │  ┌─────────────┐               │
│  │ Salty OS  │→ │Salty   │ │  │ Agent Zero  │               │
│  │ Frontend  │  │API     │ │  │             │               │
│  │ :3000     │  │:3001   │ │  │ :80         │               │
│  └──────────┘  └───┬────┘ │  └─────────────┘               │
│                    │       │                                 │
│  n8n.bkelogistics.com      │  postiz.bkelogistics.com       │
│  ┌──────────┐              │  ┌──────────┐                  │
│  │ n8n      │              │  │ Postiz   │                  │
│  │ :5678    │              │  │ :5000    │                  │
│  └────┬─────┘              │  └────┬─────┘                  │
│       │                    │       │                         │
│  ┌────┴────────────────────┴───────┴─────┐                  │
│  │         PostgreSQL :5432              │                  │
│  │  saltyos │ n8n │ postiz │ agent_zero  │                  │
│  └────────────────────────────────────────┘                  │
│  ┌────────────────┐                                          │
│  │  Redis :6379   │  (Postiz, n8n queue, Firecrawl)         │
│  └────────────────┘                                          │
│                                                              │
│  Internal services (no subdomain):                           │
│  Gotenberg :3200  │  Firecrawl :3002  │  Stirling :8080     │
└─────────────────────────────────────────────────────────────┘
                    agent-network (Docker bridge)
```

---

## Quick Start — Full Stack

```bash
git clone https://github.com/Liquidt2/Salty-OS.git
cd Salty-OS
cp .env.example .env
# Edit .env with your API keys

# Deploy everything
docker compose -f docker-stack.yml up -d --build
```

### Salty OS Only (connects to existing services)

```bash
docker compose up -d --build
```

---

## Subdomains → Nginx Proxy Manager

| Subdomain | Container | Port |
|-----------|-----------|------|
| ops.bkelogistics.com | salty-os | 3000 |
| klaus.bkelogistics.com | agent-zero | 80 |
| n8n.bkelogistics.com | n8n | 5678 |
| postiz.bkelogistics.com | postiz | 5000 |
| pdf.bkelogistics.com | stirling-pdf | 8080 |

In Hostinger's Nginx Proxy Manager, create a proxy host for each:
- **Domain:** `ops.bkelogistics.com`
- **Forward:** `salty-os:3000` (or `localhost:3000`)
- **SSL:** Request new Let's Encrypt cert

---

## Safe Updates

```bash
./scripts/update.sh
# Auto-backup → git pull → rebuild → restart → rollback if failed
```

Data lives in Docker volumes — never touched during code updates.

---

## Backup & Restore

```bash
./scripts/backup.sh                    # Create backup
./scripts/restore.sh ./backups/xxx.json # Restore
```

Also available in the Settings page UI.

---

## File Structure

```
Salty-OS/
├── docker-stack.yml        # Full stack (all services)
├── docker-compose.yml      # Salty OS only
├── Dockerfile              # Frontend (Nginx + React)
├── nginx.conf              # Frontend proxy config
├── .env.example            # Config template
├── package.json            # Frontend dependencies
├── vite.config.js          # Build config
├── index.html              # HTML shell
├── src/
│   ├── App.jsx             # Dashboard (all 8 pages)
│   └── main.jsx            # React entry
├── server/
│   ├── index.js            # Express API server
│   ├── package.json        # Backend dependencies
│   └── Dockerfile          # Backend container
├── db/
│   └── init.sql            # PostgreSQL init (creates all DBs)
├── scripts/
│   ├── backup.sh
│   ├── update.sh
│   └── restore.sh
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/health | Health check |
| GET/POST | /api/kanban | Kanban tasks |
| POST | /api/kanban/sync | Bulk board sync |
| GET/POST | /api/crons | Scheduled tasks |
| GET/POST | /api/agents | Agent configs |
| GET/POST | /api/activity | Activity logs |
| GET | /api/deliverables | Files & assets |
| GET/POST | /api/settings | Key-value settings |
| POST | /api/backup | Create backup |
| POST | /api/restore | Restore from backup |
| GET | /api/services | Service status check |
| ALL | /api/proxy/agent-zero/* | Agent Zero proxy |
| ALL | /api/proxy/n8n/* | n8n proxy |

---

*Built for BKE Logistics LLC*
