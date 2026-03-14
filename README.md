# 🧂 Salty OS — Command Center

**BKE Logistics × Source of Truth Operations Dashboard**

A clean, modern, high-end operations dashboard designed for freight brokerage and business management. Salty OS serves as the central hub for tracking tasks, schedules, and various business services.

---

## 🚀 Quick Start — Docker Deployment

Salty OS is fully containerized and includes a bundled PostgreSQL database.

```bash
git clone https://github.com/Liquidt2/Salty-OS.git
cd Salty-OS

# 1. Create your config
cp .env.example .env

# 2. Start the system
docker compose up -d --build
```

The dashboard will be available at: **http://localhost:3000**

---

## 🛠️ Features

- **Dynamic Branding**: Upload your own logo and set your company name/title via Settings.
- **Instant Versioning**: Reactive system version indicator in the dashboard footer.
- **Kanban Board**: Drag-and-drop task management for operational workflows.
- **Agent Integrations**: Built-in compatibility with OpenClaw (Klaus) and other automation services.
- **System Resilience**: File-based settings fallback ensures your dashboard works even during database maintenance.

---

## 📂 File Structure

```
Salty-OS/
├── docker-compose.yml      # Full stack (Frontend, API, DB)
├── Dockerfile              # Frontend (Nginx + React)
├── nginx.conf              # Frontend proxy config
├── .env.example            # Environment template
├── src/                    # React Frontend source
├── server/                 # Express API Backend source
├── db/                     # Database initialization
└── scripts/                # Utility scripts (Backup/Update/Restore)
```

---

## 🔧 Utility Scripts

Located in the `scripts/` directory:

- **`update.sh`**: Pulls latest code from GitHub and re-deploys without data loss.
- **`backup.sh`**: Creates a timestamped backup of your settings and database.
- **`restore.sh`**: Restores system state and database from a backup file.

---

## 🔌 API Endpoints (Core)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/settings | Load system branding and config |
| POST | /api/settings | Save system branding and config |
| POST | /api/settings/logo | Upload custom branding logo |
| GET | /api/kanban | Fetch current task board |
| GET | /api/health | Server health check |

---

*Built for BKE Logistics LLC*
