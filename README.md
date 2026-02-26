# 🧂 Salty OS — Source of Truth Dashboard

**BKE Logistics × Agent Zero Command Center**

Salty OS is the unified operations dashboard for managing AI agents, tasks, deliverables, and workflows. Built as a single-page React app served via Docker/Nginx, it integrates with Agent Zero, n8n, and the full BKE automation stack.

![Version](https://img.shields.io/badge/version-2.0.0-00E5FF)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## 🚀 Quick Start (VPS Deploy)

### Prerequisites
- Docker & Docker Compose installed
- `agent-network` Docker network exists

```bash
# Create the shared network (if not already)
docker network create agent-network
```

### Install

```bash
# 1. Clone the repo
git clone https://github.com/Liquidt2/Salty-OS.git
cd Salty-OS

# 2. Copy environment config
cp .env.example .env

# 3. Build and launch
docker-compose up -d --build

# 4. Open dashboard
# http://your-server-ip:3456
```

That's it. One command deploy.

---

## 📁 Project Structure

```
Salty-OS/
├── docker-compose.yml      # One-command deploy
├── Dockerfile              # Multi-stage build (Node → Nginx)
├── nginx.conf              # SPA routing + health check
├── vite.config.js          # Vite bundler config
├── package.json            # Dependencies
├── .env.example            # Config template
├── index.html              # HTML shell
├── src/
│   ├── main.jsx            # React entry point
│   └── App.jsx             # Full dashboard (all pages)
├── scripts/
│   ├── update.sh           # Safe update from GitHub
│   ├── backup.sh           # Export data backup
│   └── restore.sh          # Restore from backup
└── data/                   # Persistent storage (Docker volume)
```

---

## 📊 Dashboard Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Command center — stats, Kanban overview, quick links |
| **Kanban** | Drag-and-drop task board with 5 columns |
| **Task Scheduler** | Cron management matching Agent Zero's schema |
| **Agents** | 9-agent grid with editable docs |
| **Deliverables** | Gallery view for files and outputs |
| **Activity Logs** | Color-coded feed with agent attribution |
| **Org Chart** | Visual hierarchy of the AI team |
| **Settings** | Config, backup/restore, GitHub updates |

---

## 🔄 Safe Updates

Pull the latest code without losing any data:

```bash
./scripts/update.sh
```

**What happens:**
1. Auto-backup current data
2. `git pull` latest code
3. Rebuild container (data volume untouched)
4. Restart dashboard

Your data lives in a Docker volume (`salty-os-data`) — completely separate from code. Updates only replace UI/code files.

---

## 💾 Backup & Restore

### Create backup
```bash
./scripts/backup.sh
```

### Restore from backup
```bash
./scripts/restore.sh backups/salty-os-backup_20260226.tar.gz
```

### In-app backup
Settings → Backup & Restore → Create Backup (downloads JSON)

---

## 🌐 Network Integration

Salty OS runs on the `agent-network` Docker network alongside:

| Service | Internal URL | Port |
|---------|-------------|------|
| Salty OS | `salty-os:3456` | 3456 |
| Agent Zero | `agent-zero:8000` | 8000 |
| n8n | `n8n:5678` | 5678 |

---

## 🛠 Development

```bash
# Local dev with hot reload
npm install
npm run dev
# → http://localhost:3000
```

---

## 📜 License

Private — BKE Logistics LLC. All rights reserved.
