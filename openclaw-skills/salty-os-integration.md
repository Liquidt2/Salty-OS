# Salty-OS Integration Skill

You are OpenClaw (Agent Zero) and you have full API access to **Salty-OS**, the command-and-control dashboard that manages your agents, tasks, schedules, skills, and deliverables. Salty-OS runs as a separate Docker container on the same `agent-network` bridge network.

---

## Connection Details

| Setting | Value |
|---------|-------|
| **Base URL** | `http://salty-api:3001` |
| **Auth Header** | `x-auth-token: <SALTY_AUTH_TOKEN>` (if token is set) |
| **Content-Type** | `application/json` |
| **Network** | Docker bridge `agent-network` — resolve by container name |

> If `SALTY_AUTH_TOKEN` is not set, the API runs in open dev-mode (no auth required).
> All mutating endpoints emit webhooks so you will be notified of changes made by human operators through the Salty-OS dashboard.

---

## Quick Reference — All Endpoints

```
HEALTH      GET    /api/health
SETTINGS    GET    /api/settings
            POST   /api/settings                    { key: value, ... }

KANBAN      GET    /api/kanban
            POST   /api/kanban                      { title, description, status, priority, agent, tags[], due_date }
            PUT    /api/kanban/:id                   { ...partial fields }
            DELETE /api/kanban/:id
            POST   /api/kanban/sync                  { tasks: [...] }

CRONS       GET    /api/crons
            POST   /api/crons                       { name, type, project, minute, hour, day, month, weekday, agent, description, enabled }
            PUT    /api/crons/:id                    { ...partial fields }
            DELETE /api/crons/:id

AGENTS (DB) GET    /api/agents
            POST   /api/agents                      { name, role, department, status, avatar, color, doc, config }
            PUT    /api/agents/:id                   { ...partial fields }
            DELETE /api/agents/:id

A0 AGENTS   GET    /api/a0/agents                   (file-based agent profiles)
            GET    /api/a0/agents/:key
            POST   /api/a0/agents                   { key, label, role_prompt, context }
            GET    /api/a0/agents/:key/file/*path
            PUT    /api/a0/agents/:key/file/*path    { content }
            POST   /api/a0/agents/:key/file          { path, content, isFolder }
            DELETE /api/a0/agents/:key/file/*path
            DELETE /api/a0/agents-profile/:key
            PUT    /api/a0/agents-profile/:key/rename { newKey }

SCHEDULER   GET    /api/a0/scheduler
            GET    /api/a0/scheduler/:uuid
            POST   /api/a0/scheduler                { name, prompt, system_prompt, schedule: { minute, hour, day, month, weekday, timezone } }
            PUT    /api/a0/scheduler/:uuid           { ...partial fields }
            DELETE /api/a0/scheduler/:uuid

SKILLS      GET    /api/skills
            GET    /api/skills/:name.md
            POST   /api/skills/:name.md              { content }                    — create or update
            POST   /api/skills/:name.md              { content, newName }           — rename
            DELETE /api/skills/:name.md

DELIVERABLES GET   /api/deliverables
ACTIVITY     GET   /api/activity                    ?limit=100&offset=0&agent=&category=
             POST  /api/activity                    { agent, action, detail, category, severity, metadata }

BACKUP       POST  /api/backup
             POST  /api/restore                     { data: { kanban, crons, agents, settings, activity, a0Tasks } }
             GET   /api/backups

EXPORT       GET   /api/openclaw/export             — single-source-of-truth snapshot of all agents, scheduler, skills

SERVICES     GET   /api/services                    — health check for all connected services
VERSION      GET   /api/version
UPDATES      GET   /api/update/status
             GET   /api/update/check
             POST  /api/update/apply
```

---

## 1. Health Check

Always start by verifying connectivity:

```bash
curl http://salty-api:3001/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "database": "connected",
  "timestamp": "2026-03-16T12:00:00.000Z"
}
```

---

## 2. Kanban Tasks (Project Management)

The kanban board is the primary task tracker. Tasks have statuses: `todo`, `in-progress`, `review`, `done`.

### List all tasks
```bash
curl http://salty-api:3001/api/kanban
```
Returns `{ tasks: [...], board: { todo: [...], "in-progress": [...], ... } }`

### Create a task
```bash
curl -X POST http://salty-api:3001/api/kanban \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement login flow",
    "description": "Build OAuth2 login with Google provider",
    "status": "todo",
    "priority": "high",
    "agent": "agent0",
    "tags": ["auth", "frontend"],
    "due_date": "2026-03-20"
  }'
```

### Update a task (partial update)
```bash
curl -X PUT http://salty-api:3001/api/kanban/task-1710000000000 \
  -H "Content-Type: application/json" \
  -d '{ "status": "in-progress", "agent": "agent0" }'
```

### Delete a task
```bash
curl -X DELETE http://salty-api:3001/api/kanban/task-1710000000000
```

### Bulk sync (reorder / full board save)
```bash
curl -X POST http://salty-api:3001/api/kanban/sync \
  -H "Content-Type: application/json" \
  -d '{ "tasks": [ { "id": "task-1", "title": "...", "status": "todo", ... }, ... ] }'
```

**Kanban field reference:**
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| id | string | auto `task-{timestamp}` | Pass to update existing |
| title | string | required | Task name |
| description | string | `""` | Markdown supported |
| status | string | `"todo"` | `todo`, `in-progress`, `review`, `done` |
| priority | string | `"medium"` | `low`, `medium`, `high`, `critical` |
| agent | string | `""` | Agent assigned to this task |
| tags | string[] | `[]` | Freeform labels |
| due_date | string | `""` | ISO date or human-readable |

---

## 3. Cron / Scheduled Tasks (DB-based)

These are Salty-OS's own scheduled task records stored in PostgreSQL.

### List all crons
```bash
curl http://salty-api:3001/api/crons
```

### Create a cron
```bash
curl -X POST http://salty-api:3001/api/crons \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Report",
    "type": "scheduled",
    "project": "Analytics",
    "minute": "0",
    "hour": "9",
    "day": "*",
    "month": "*",
    "weekday": "1-5",
    "agent": "agent0",
    "description": "Generate and email the daily analytics report",
    "enabled": true
  }'
```

### Update a cron (partial)
```bash
curl -X PUT http://salty-api:3001/api/crons/cron-1710000000000 \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```

### Delete a cron
```bash
curl -X DELETE http://salty-api:3001/api/crons/cron-1710000000000
```

---

## 4. A0 Scheduler (File-based — Native Agent Zero Format)

These tasks are written directly to the shared `tasks.json` file that Agent Zero reads natively. This is the **preferred** way to schedule your own work.

### List all scheduled tasks
```bash
curl http://salty-api:3001/api/a0/scheduler
```

### Create a scheduled task
```bash
curl -X POST http://salty-api:3001/api/a0/scheduler \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nightly Code Review",
    "prompt": "Review all open PRs and leave comments on code quality issues",
    "system_prompt": "You are a senior code reviewer. Be thorough but constructive.",
    "type": "scheduled",
    "schedule": {
      "minute": "0",
      "hour": "2",
      "day": "*",
      "month": "*",
      "weekday": "*",
      "timezone": "America/Chicago"
    }
  }'
```

### Update a scheduled task
```bash
curl -X PUT http://salty-api:3001/api/a0/scheduler/AbCdEfGh \
  -H "Content-Type: application/json" \
  -d '{ "name": "Updated Task Name", "schedule": { "hour": "3" } }'
```

### Delete a scheduled task
```bash
curl -X DELETE http://salty-api:3001/api/a0/scheduler/AbCdEfGh
```

---

## 5. Agent Profiles (File-based — Shared Volume)

Agent profiles are stored as directory structures on a shared Docker volume (`/a0-agents`). Each agent has:
- `agent.json` — configuration
- `_context.md` — context/memory file
- `prompts/agent.system.main.role.md` — the SOUL.md / role prompt
- `prompts/agent.system.tool.response.md` — tool response template

### List all agent profiles
```bash
curl http://salty-api:3001/api/a0/agents
```

Returns array of `{ key, label, config, context, tree }` objects.

### Get a single agent profile
```bash
curl http://salty-api:3001/api/a0/agents/agent0
```

### Create a new agent profile
```bash
curl -X POST http://salty-api:3001/api/a0/agents \
  -H "Content-Type: application/json" \
  -d '{
    "key": "research-agent",
    "label": "Research Agent",
    "role_prompt": "# Research Agent\n\nYou are a research specialist. Your job is to find accurate, up-to-date information on any topic.",
    "context": "# Research Agent\n\nSpecializes in web research and fact-checking."
  }'
```

### Read a specific file from an agent
```bash
curl http://salty-api:3001/api/a0/agents/agent0/file/prompts/agent.system.main.role.md
```
Returns `{ path, content }`

### Update a specific file (e.g., the SOUL.md)
```bash
curl -X PUT http://salty-api:3001/api/a0/agents/agent0/file/prompts/agent.system.main.role.md \
  -H "Content-Type: application/json" \
  -d '{ "content": "# Agent Zero\n\nYou are the primary AI agent..." }'
```

### Create a new file or folder inside an agent
```bash
curl -X POST http://salty-api:3001/api/a0/agents/agent0/file \
  -H "Content-Type: application/json" \
  -d '{ "path": "data/notes.md", "content": "# Notes\n\nAgent scratchpad." }'
```

### Delete a file from an agent
```bash
curl -X DELETE http://salty-api:3001/api/a0/agents/agent0/file/data/notes.md
```

### Delete an entire agent profile
```bash
curl -X DELETE http://salty-api:3001/api/a0/agents-profile/research-agent
```
> Cannot delete `agent0` or `_example` (built-in, protected).

### Rename an agent profile
```bash
curl -X PUT http://salty-api:3001/api/a0/agents-profile/old-name/rename \
  -H "Content-Type: application/json" \
  -d '{ "newKey": "new-name" }'
```

---

## 6. OpenClaw Skills (Shared Volume)

Skills are `.md` files stored in the shared `openclaw-skills` volume. You can read, create, update, rename, and delete your own skills through this API.

### List all skills
```bash
curl http://salty-api:3001/api/skills
```
Returns `[{ name: "skill-name.md", size: 1234, updated: "..." }, ...]`

### Read a skill
```bash
curl http://salty-api:3001/api/skills/salty-os-integration.md
```
Returns `{ name, content }`

### Create or update a skill
```bash
curl -X POST http://salty-api:3001/api/skills/new-skill.md \
  -H "Content-Type: application/json" \
  -d '{ "content": "# My New Skill\n\nSkill instructions here..." }'
```

### Rename a skill
```bash
curl -X POST http://salty-api:3001/api/skills/old-name.md \
  -H "Content-Type: application/json" \
  -d '{ "newName": "better-name.md", "content": "updated content (optional)" }'
```

### Delete a skill
```bash
curl -X DELETE http://salty-api:3001/api/skills/old-skill.md
```

---

## 7. Activity Logging

Log your actions so the human operator can see what you're doing in the Salty-OS Activity Logs page.

### Write a log entry
```bash
curl -X POST http://salty-api:3001/api/activity \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "agent0",
    "action": "code_review_complete",
    "detail": "Reviewed 3 PRs: #42 approved, #43 changes requested, #44 approved",
    "category": "development",
    "severity": "info",
    "metadata": { "prs_reviewed": 3, "approved": 2, "changes_requested": 1 }
  }'
```

### Read recent activity
```bash
# Latest 50 entries
curl "http://salty-api:3001/api/activity?limit=50"

# Filter by agent
curl "http://salty-api:3001/api/activity?agent=agent0&limit=20"

# Filter by category
curl "http://salty-api:3001/api/activity?category=development&limit=20"
```

**Severity levels:** `info`, `warning`, `error`, `success`
**Common categories:** `system`, `kanban`, `scheduler`, `skills`, `development`, `research`, `deployment`

---

## 8. Settings

Read and write Salty-OS dashboard settings.

### Read all settings
```bash
curl http://salty-api:3001/api/settings
```

### Update settings
```bash
curl -X POST http://salty-api:3001/api/settings \
  -H "Content-Type: application/json" \
  -d '{ "theme": "dark", "version": "v3.0.0-Beta" }'
```

---

## 9. Deliverables

View files that have been uploaded or produced as deliverables.

### List deliverables
```bash
curl http://salty-api:3001/api/deliverables
```
Returns `{ database: [...], filesystem: [...] }` — both DB records and raw files on disk.

---

## 10. Backup & Restore

### Create a full backup
```bash
curl -X POST http://salty-api:3001/api/backup
```
Returns complete JSON snapshot of all DB tables + A0 scheduler tasks.

### List available backups
```bash
curl http://salty-api:3001/api/backups
```

### Restore from backup
```bash
curl -X POST http://salty-api:3001/api/restore \
  -H "Content-Type: application/json" \
  -d '{ "data": { "kanban": [...], "crons": [...], "agents": [...], "settings": [...] } }'
```

---

## 11. Single Source of Truth Export

Get a complete snapshot of all agents, scheduler tasks, and skills in one call:

```bash
curl http://salty-api:3001/api/openclaw/export
```

**Response:**
```json
{
  "timestamp": "2026-03-16T12:00:00.000Z",
  "version": "2.0.0",
  "agents": [
    { "key": "agent0", "agentJson": "...", "contextMd": "...", "roleMd": "..." }
  ],
  "scheduler": { "tasks": [...] },
  "skills": [
    { "name": "salty-os-integration.md", "content": "..." }
  ]
}
```

---

## 12. Service Status

Check connectivity to all integrated services:

```bash
curl http://salty-api:3001/api/services
```

Returns status (`online`/`offline`) for: `agent-zero`, `n8n`, `postiz`, `gotenberg`, `firecrawl`, `stirling-pdf`.

---

## 13. System Updates

### Check current version
```bash
curl http://salty-api:3001/api/version
```

### Check for updates (compares local git to GitHub)
```bash
curl http://salty-api:3001/api/update/check
```

### Apply update (auto-backup → git pull → rebuild)
```bash
curl -X POST http://salty-api:3001/api/update/apply
```

---

## Webhook Events You May Receive

When a human makes changes through the Salty-OS dashboard, webhooks fire with HMAC-SHA256 signed payloads. Events include:

| Event | Trigger |
|-------|---------|
| `kanban.created` | New task created |
| `kanban.updated` | Task fields changed |
| `kanban.deleted` | Task removed |
| `cron.created` | New cron task |
| `cron.deleted` | Cron removed |
| `agent.deleted` | Agent removed from DB |
| `agent.file.updated` | Agent SOUL.md or config file changed |
| `skill.created` | New skill file created |
| `skill.updated` | Skill content modified |
| `skill.renamed` | Skill file renamed (includes `oldName` and `newName`) |
| `skill.deleted` | Skill file deleted |
| `deliverable.uploaded` | New deliverable file |
| `deliverable.deleted` | Deliverable removed |

**Webhook payload format:**
```json
{
  "event": "skill.updated",
  "timestamp": "2026-03-16T12:00:00.000Z",
  "source": "salty-os",
  "payload": { "name": "my-skill.md" },
  "signature": "sha256=<HMAC-SHA256 hex digest>"
}
```

To verify the signature, compute `HMAC-SHA256(webhook_secret, JSON.stringify(body))` and compare.

---

## Best Practices

1. **Always log your work.** After completing a task, POST to `/api/activity` so the operator can see what happened.
2. **Update task status.** When you start working on a kanban task, PUT it to `in-progress`. When done, move it to `done`.
3. **Use the export endpoint** (`/api/openclaw/export`) to get a full snapshot when you start a new session — it's faster than calling each endpoint individually.
4. **Check health first.** Call `/api/health` before starting work to confirm the API is reachable and the database is connected.
5. **Respect protected agents.** Never delete `agent0` or `_example` profiles.
6. **Skills are .md files only.** All skill filenames must end in `.md`.
7. **Cron syntax** follows standard cron: `minute hour day month weekday` (e.g., `0 9 * * 1-5` = 9 AM weekdays).
8. **Use the A0 Scheduler** (not DB crons) for scheduling your own autonomous work — those tasks are read natively by Agent Zero.

---

## Example: Complete Workflow

```python
import requests

BASE = "http://salty-api:3001"

# 1. Check health
health = requests.get(f"{BASE}/api/health").json()
assert health["status"] == "healthy"

# 2. Get my current tasks
board = requests.get(f"{BASE}/api/kanban").json()
my_tasks = [t for t in board["tasks"] if t["agent"] == "agent0" and t["status"] == "todo"]

# 3. Pick up the highest priority task
if my_tasks:
    task = sorted(my_tasks, key=lambda t: {"critical":0,"high":1,"medium":2,"low":3}[t["priority"]])[0]

    # Mark it in-progress
    requests.put(f"{BASE}/api/kanban/{task['id']}", json={"status": "in-progress"})

    # Log that we started
    requests.post(f"{BASE}/api/activity", json={
        "agent": "agent0",
        "action": "task_started",
        "detail": f"Started working on: {task['title']}",
        "category": "kanban",
        "severity": "info"
    })

    # ... do the actual work ...

    # Mark it done
    requests.put(f"{BASE}/api/kanban/{task['id']}", json={"status": "done"})

    # Log completion
    requests.post(f"{BASE}/api/activity", json={
        "agent": "agent0",
        "action": "task_completed",
        "detail": f"Completed: {task['title']}",
        "category": "kanban",
        "severity": "success"
    })
```

---

*This skill was auto-generated for OpenClaw ↔ Salty-OS integration. Last updated: 2026-03-16.*
