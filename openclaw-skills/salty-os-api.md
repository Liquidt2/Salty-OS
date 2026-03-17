---
name: salty-os-api
description: >
  Use Salty-OS as the BKE Logistics operator dashboard and system of record.
  Use this skill whenever you need to register deliverables, log activity,
  manage kanban tasks, sync crons, read/write agent profiles or skills,
  or check service health. This is the primary integration point between
  OpenClaw and the Salty-OS dashboard. Always register deliverables here
  before considering any artifact task complete.
version: 2.4.0
updated: 2026-03-17
---

# Salty-OS API Skill — v2.4.0

## Base URL & Auth

```
Base URL : http://salty-api:3001
Auth     : Authorization: Bearer <SALTY_API_KEY>
           (key stored in .secrets/salty-os.env)
```

All endpoints except `/api/health` require authentication.

---

## DELIVERABLES — Priority #1

**Harvey's Rule: Every user-facing artifact must be registered in Salty-OS before the task is complete.**

### Register a text/markdown/CSV deliverable

```python
import requests, os

def push_deliverable(filename, content, title=None, agent="klaus",
                     mime_type=None, tags=None, source_task_id=None):
    """Register a text-based artifact in Salty-OS deliverables."""
    if mime_type is None:
        if filename.endswith(".md"):    mime_type = "text/markdown"
        elif filename.endswith(".csv"): mime_type = "text/csv"
        elif filename.endswith(".json"): mime_type = "application/json"
        else:                           mime_type = "text/plain"

    r = requests.post(
        "http://salty-api:3001/api/deliverables",
        json={
            "filename": filename,
            "content":  content,          # plain text — writes correctly to disk
            "title":    title or filename.replace("-"," ").replace("_"," "),
            "mime_type": mime_type,
            "agent":    agent,
            "source_agent": agent,
            "source_task_id": source_task_id or "",
            "tags":     tags or [],
        },
        headers={"Authorization": f"Bearer {os.environ['SALTY_API_KEY']}"}
    )
    r.raise_for_status()
    return r.json()  # { id, name, filename, size_bytes, ... }
```

### Register a binary deliverable (PDF, image)

```python
import base64

def push_binary_deliverable(filepath, title=None, agent="rex",
                             mime_type="application/pdf", tags=None):
    """Register a binary file (PDF, image, etc.) in Salty-OS deliverables."""
    with open(filepath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    filename = os.path.basename(filepath)
    r = requests.post(
        "http://salty-api:3001/api/deliverables",
        json={
            "filename": filename,
            "base64":   b64,
            "title":    title or filename,
            "mime_type": mime_type,
            "agent":    agent,
            "source_agent": agent,
            "tags":     tags or [],
        },
        headers={"Authorization": f"Bearer {os.environ['SALTY_API_KEY']}"}
    )
    r.raise_for_status()
    return r.json()
```

### Deliverables endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/deliverables` | Upload/register artifact |
| GET | `/api/deliverables` | List all (DB + unregistered files) |
| GET | `/api/deliverables/:id` | Get single record |
| GET | `/api/deliverables/:id/download` | Download file |
| GET | `/api/deliverables/:id/preview` | Serve inline (browser preview) |
| PUT | `/api/deliverables/:id` | Update metadata |
| DELETE | `/api/deliverables/:id` | Delete record + file |
| POST | `/api/deliverables/ingest-local` | Register untracked filesystem files |

### POST body fields

| Field | Required | Notes |
|---|---|---|
| `filename` | ✅ Always | Used as the display filename and for type detection |
| `content` | One of these | Plain text/markdown/CSV — written as UTF-8 |
| `base64` | One of these | Data URL or raw base64 for binary files |
| `title` | Optional | Human display name (auto-derived from filename if omitted) |
| `mime_type` | Optional | Auto-detected from extension if omitted |
| `agent` | Optional | Which agent produced this (e.g. "klaus", "rex") |
| `source_agent` | Optional | Same as agent |
| `source_task_id` | Optional | Kanban task ID this deliverable came from |
| `tags` | Optional | Array of strings |
| `project` | Optional | Project name string |

---

## ACTIVITY LOGS

Always log significant actions:

```python
requests.post("http://salty-api:3001/api/activity", json={
    "agent":    "klaus",
    "action":   "market_report_generated",
    "detail":   "Weekly freight market PDF delivered to Harvey",
    "category": "deliverables",   # system | deliverables | kanban | scheduler | skills
    "severity": "info",           # info | warning | error
}, headers={"Authorization": f"Bearer {os.environ['SALTY_API_KEY']}"})
```

---

## KANBAN TASKS

```python
# Create/upsert task
requests.post("http://salty-api:3001/api/kanban", json={
    "id":          "task-unique-id",   # omit to auto-generate
    "title":       "Build carrier list",
    "description": "Find 50 reefer carriers in the Southeast",
    "status":      "todo",             # backlog | todo | inProgress | inReview | done
    "priority":    "high",             # critical | high | medium | low
    "agent":       "axel",
    "tags":        ["carriers", "reefer"],
    "due_date":    "2026-03-24",
}, headers=auth)

# Move task to different column
requests.put("http://salty-api:3001/api/kanban/{id}", json={
    "status": "inProgress"
}, headers=auth)

# Delete task
requests.delete("http://salty-api:3001/api/kanban/{id}", headers=auth)
```

---

## CRON SCHEDULER

```python
# Create/upsert cron
requests.post("http://salty-api:3001/api/crons", json={
    "id":          "cron-unique-id",   # omit to auto-generate
    "name":        "Daily Prospect Scrape",
    "type":        "scheduled",        # scheduled | manual
    "project":     "Lead Generation",
    "state":       "idle",             # idle | running | disabled
    "minute":      "0",
    "hour":        "6",
    "day":         "*",
    "month":       "*",
    "weekday":     "1-5",
    "agent":       "axel",
    "description": "Scrape Apollo.io for new manufacturing prospects",
    "enabled":     True,
}, headers=auth)

# Update state (enable/disable)
requests.put("http://salty-api:3001/api/crons/{id}", json={
    "state": "disabled"
}, headers=auth)
```

---

## AGENT PROFILES (DB)

```python
# Upsert agent DB record
requests.post("http://salty-api:3001/api/agents", json={
    "id":         "agent-klaus",
    "name":       "Klaus",
    "role":       "COO",
    "department": "Operations",
    "status":     "active",    # active | idle | error
    "color":      "#00E5FF",
    "doc":        "Chief Operations Officer. Manages all workflows.",
}, headers=auth)
```

---

## OPENCLAW PROFILES (File-Based)

These operate on the shared `/a0/agents` volume:

```python
# List all profiles
GET /api/a0/agents

# Read a file from an agent profile
GET /api/a0/agents/klaus/file/data/memory.md

# Write/update a file in an agent profile
PUT /api/a0/agents/klaus/file/data/memory.md
Body: { "content": "# MEMORY.md\n..." }

# Create a new file in an agent profile
POST /api/a0/agents/klaus/file
Body: { "path": "prompts/custom.md", "content": "..." }
```

---

## SKILLS

```python
# List all skills
GET /api/skills

# Read a skill
GET /api/skills/salty-os-api.md

# Save/update a skill
POST /api/skills/salty-os-api.md
Body: { "content": "---\nname: ...\n---\n..." }

# Rename a skill
POST /api/skills/old-name.md
Body: { "newName": "new-name.md", "content": "..." }
```

---

## SETTINGS

```python
# Read all settings
GET /api/settings

# Save settings (partial update — only keys you pass are changed)
POST /api/settings
Body: {
    "companyName": "BKE Logistics",
    "agentZeroUrl": "https://klaus.bkelogistics.com",
    "n8nUrl": "https://n8n.bkelogistics.com",
    "postizUrl": "https://postiz.bkelogistics.com",
}
```

---

## SERVICE HEALTH

```python
# Check all service statuses
r = requests.get("http://salty-api:3001/api/services", headers=auth)
# Returns: { openclaw: {status, url}, n8n: {status, url}, ... }
# status values: "online" | "offline" | "error" | "unconfigured"

# Salty-OS itself
GET /api/health  # No auth required
# Returns: { status: "healthy", version: "2.4.0", uptime, database: "connected" }
```

---

## EXPORT / BACKUP

```python
# Full OpenClaw snapshot (agents + scheduler + skills)
GET /api/openclaw/export

# Full DB backup (kanban + crons + agents + settings + activity)
POST /api/backup

# Restore from backup
POST /api/restore
Body: { "data": { ...backup.data } }
```

---

## Artifact Type Auto-Detection

| Extension | Type |
|---|---|
| `.pdf` | `pdf` |
| `.png .jpg .jpeg .gif .webp .svg` | `image` |
| `.mp4 .mov .avi .webm` | `video` |
| `.doc .docx .txt .md` | `doc` |
| `.csv` | `doc` (use mime_type: text/csv) |
| everything else | `document` |

---

## Enforcement Checklist (before completing any task with an artifact)

1. ✅ Call `POST /api/deliverables` with `filename` + `content` or `base64`
2. ✅ Confirm response has `id` field — if missing, report failure
3. ✅ Log to `/api/activity` with category `deliverables`
4. ✅ If linked to a kanban task, move task to `inReview` or `done`
5. ✅ Store `deliverable_id` in task notes or activity detail

---

## Current Service URLs (v2.4.0)

| Service | URL |
|---|---|
| Salty-OS API (internal) | http://salty-api:3001 |
| OpenClaw | https://klaus.bkelogistics.com |
| n8n | https://n8n.bkelogistics.com |
| Postiz | https://postiz.bkelogistics.com |
| Stirling-PDF | not installed yet |
