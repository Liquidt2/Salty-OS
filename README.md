# 🧂 Salty OS

**BKE Logistics × Agent Zero Command Center**

A unified operations dashboard for managing AI agents, tasks, projects, and business operations.

---

## Features

- **Dashboard** — Real-time command center with stats and quick links
- **Kanban Board** — Drag-and-drop task management across 5 stages
- **Task Scheduler** — Cron-based automation matching Agent Zero's schema
- **Agent Management** — 9 AI agents with role docs and status tracking
- **Deliverables** — Gallery view for all generated assets
- **Activity Logs** — Color-coded feed with agent attribution
- **Org Chart** — Visual hierarchy of agent structure
- **Settings** — Backup/restore, GitHub updates, API connections

---

## Quick Start (VPS Deploy)

### Prerequisites
- Docker & Docker Compose installed
- `agent-network` Docker network exists

```bash
# Create shared network (if not already)
docker network create agent-network
```

### Install

```bash
git clone https://github.com/Liquidt2/Salty-OS.git
cd Salty-OS
cp .env.example .env
docker compose up -d --build
```

Dashboard: `http://your-server-ip:3000`

### Development Mode

```bash
npm install
npm run dev
```

---

## Updating (Safe — Zero Data Loss)

```bash
./scripts/update.sh
```

**How it works:**
1. Creates pre-update backup in `./backups/`
2. Pulls latest code from GitHub
3. Rebuilds Docker container (code only)
4. Restarts with new code
5. Health check — auto-rollback if failed

Your data lives in a Docker volume (`salty-os-data`) that is **never touched** during updates.

---

## Backup & Restore

```bash
# Create backup
./scripts/backup.sh

# Restore
./scripts/restore.sh ./backups/salty-os-backup-20250226_120000.json
```

Also available in the Settings page UI.

---

## Project Structure

```
Salty-OS/
├── docker-compose.yml      # One-command deploy
├── Dockerfile              # Multi-stage production build
├── .env.example            # Config template
├── package.json            # Dependencies
├── vite.config.js          # Build config
├── index.html              # HTML shell
├── src/
│   ├── App.jsx             # Main dashboard (all pages)
│   └── main.jsx            # React entry point
├── scripts/
│   ├── backup.sh           # Create data backup
│   ├── update.sh           # Safe GitHub update
│   └── restore.sh          # Restore from backup
├── data/                   # Docker volume mount
├── backups/                # Backup files (local)
└── README.md
```

---

## Network Integration

| Service | Port | Purpose |
|---------|------|---------|
| Agent Zero | :80 | AI agent framework |
| n8n | :5678 | Workflow automation |
| Postiz | :5000 | Social media scheduling |
| Gotenberg | :3100 | PDF generation |

---

## Tech Stack

- **Frontend:** React 18 + Vite
- **Styling:** CSS-in-JS (zero dependencies)
- **Container:** Docker + Alpine Node
- **Theme:** Electric Cyan glassmorphism on dark

---

*Built for BKE Logistics LLC*
