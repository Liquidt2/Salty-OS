# Salty-OS v2.4.0 — OpenClaw Integration Reference
*Updated: 2026-03-17 | Version: 2.4.0*

---

## What Is Salty-OS

Salty-OS is the BKE Logistics operator dashboard and API backend — the **single source of truth** for all agent activity. It is a Node.js/Express API (PostgreSQL-backed) with a React UI, running at:

- **Internal (Docker):** `http://salty-api:3001`
- **Public UI:** via reverse proxy on the VPS

Authentication is via `Bearer <token>` using the Salty-OS API key stored in `.secrets/salty-os.env`.

---

## What Changed in v2.4.0

### 1. Deliverables — Now Fully Functional

The deliverables pipeline is repaired. All three upload methods now work:

| Method | Field | Use When |
|---|---|---|
| Base64 binary | `base64` | Browser file upload, PDFs, images, binary files |
| Plain text | `content` | Markdown reports, CSV, JSON, plain text artifacts |
| Metadata only | neither | Register a file path that already exists on disk |

**Previous bug:** Sending `content` (plain text) created a 0-byte file. This is fixed — the content is now written to disk correctly.

### 2. Deliverables — Full API Surface

All CRUD endpoints are live:

```
POST   /api/deliverables                → upload/register a deliverable
GET    /api/deliverables                → list all (DB + unregistered filesystem files)
GET    /api/deliverables/:id            → get single record
GET    /api/deliverables/:id/download   → download file (authenticated)
GET    /api/deliverables/:id/preview    → serve inline with correct MIME type
PUT    /api/deliverables/:id            → update metadata (name, title, tags, status, etc.)
DELETE /api/deliverables/:id            → delete record + file from disk
POST   /api/deliverables/ingest-local   → scan filesystem and register untracked files into DB
```

### 3. Services Health — Now Reads Configured URLs

`GET /api/services` now reads the URLs configured in Settings first (DB `agentZeroUrl`, `n8nUrl`, `postizUrl`, `stirlingUrl`), then falls back to env vars. The configured URLs are:

| Service | URL |
|---|---|
| openclaw | https://klaus.bkelogistics.com |
| n8n | https://n8n.bkelogistics.com |
| postiz | https://postiz.bkelogistics.com |
| stirling-pdf | not installed yet |

### 4. UI Improvements

- Logo is now 1.5× larger in the sidebar
- Deliverables page has inline viewers: PDF embed, image, video player, CSV table, text/markdown/JSON code block
- All viewer types load via authenticated fetch → blob URL

---

## How OpenClaw Should Register Deliverables

**Harvey's rule: Every user-facing artifact must be registered in Salty-OS before the task is considered complete.**

### Text/Markdown/CSV Reports

```python
import requests, os

SALTY_URL = "http://salty-api:3001"
SALTY_TOKEN = os.environ["SALTY_API_KEY"]

def register_deliverable(filename, content, title=None, agent="klaus", tags=None, source_task_id=None):
    payload = {
        "filename": filename,
        "content": content,                        # plain text — now works correctly
        "title": title or filename.replace("-", " ").replace("_", " ").replace(".md", "").replace(".csv", ""),
        "mime_type": "text/markdown" if filename.endswith(".md") else "text/csv" if filename.endswith(".csv") else "text/plain",
        "agent": agent,
        "source_agent": agent,
        "source_task_id": source_task_id or "",
        "tags": tags or [],
    }
    r = requests.post(
        f"{SALTY_URL}/api/deliverables",
        json=payload,
        headers={"Authorization": f"Bearer {SALTY_TOKEN}"}
    )
    r.raise_for_status()
    return r.json()  # returns full DB record including id
```

### Binary Files (PDFs, Images)

```python
import base64

def register_binary_deliverable(filepath, title=None, agent="rex", mime_type="application/pdf"):
    with open(filepath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    filename = os.path.basename(filepath)
    payload = {
        "filename": filename,
        "base64": b64,
        "title": title or filename,
        "mime_type": mime_type,
        "agent": agent,
        "source_agent": agent,
    }
    r = requests.post(
        f"{SALTY_URL}/api/deliverables",
        json=payload,
        headers={"Authorization": f"Bearer {SALTY_TOKEN}"}
    )
    r.raise_for_status()
    return r.json()
```

### Minimum Required Fields

```json
{
  "filename": "market-update-2026-03-17.md",
  "content": "# Market Update\n...",
  "title": "Market Update 2026-03-17"
}
```

`filename` is always required. Either `content` or `base64` must be present to store actual file bytes.

---

## Full Deliverables DB Record Schema

```json
{
  "id": "del_abc123",
  "name": "Market Update 2026-03-17",
  "filename": "del_abc123_market-update-2026-03-17.md",
  "title": "Market Update 2026-03-17",
  "type": "doc",
  "artifact_type": "doc",
  "mime_type": "text/markdown",
  "path": "/data/deliverables/del_abc123_market-update-2026-03-17.md",
  "agent": "klaus",
  "project": "",
  "size_bytes": 4821,
  "sha256": "abc...",
  "tags": ["weekly", "market"],
  "source_agent": "klaus",
  "source_session_id": "",
  "source_task_id": "",
  "status": "final",
  "metadata": {},
  "created_at": "2026-03-17T07:00:00Z",
  "updated_at": "2026-03-17T07:00:00Z"
}
```

### Artifact Type Auto-Detection

If you don't pass `type`, the server infers it from the file extension:

| Extension | Detected Type |
|---|---|
| `.pdf` | `pdf` |
| `.jpg .jpeg .png .gif .webp .svg` | `image` |
| `.mp4 .mov .avi .webm` | `video` |
| `.doc .docx .txt .md` | `doc` |
| everything else | `document` |

---

## Other Key API Endpoints

### Activity Log

```
POST /api/activity
Body: { agent, action, detail, category, severity }
```

Always log significant agent actions here. `severity` = `info` | `warning` | `error`.

### Kanban

```
GET  /api/kanban                → full board + tasks array
POST /api/kanban                → create/upsert task
PUT  /api/kanban/:id            → update task fields
DELETE /api/kanban/:id          → delete task
POST /api/kanban/sync           → bulk sync (drag-and-drop reorder)
```

### Scheduler (Crons)

```
GET    /api/crons               → list all cron tasks
POST   /api/crons               → create/upsert cron
PUT    /api/crons/:id           → update (incl. state: idle/running/disabled)
DELETE /api/crons/:id           → delete
```

### Agents

```
GET    /api/agents              → list DB agent records
POST   /api/agents              → create/upsert agent
PUT    /api/agents/:id          → update
DELETE /api/agents/:id          → delete
```

### OpenClaw Profiles (File-Based)

```
GET    /api/a0/agents                        → list all agent profile folders
GET    /api/a0/agents/:key                   → single profile + file tree
GET    /api/a0/agents/:key/file/*path        → read a file
PUT    /api/a0/agents/:key/file/*path        → write/update a file
POST   /api/a0/agents/:key/file             → create new file/folder
DELETE /api/a0/agents/:key/file/*path       → delete file/folder
POST   /api/a0/agents                        → create new agent profile folder
DELETE /api/a0/agents-profile/:key          → delete entire profile folder
```

### Skills

```
GET    /api/skills              → list all .md skill files
GET    /api/skills/:name        → read skill content
POST   /api/skills/:name        → save skill (pass newName to rename)
DELETE /api/skills/:name        → delete skill
```

### Settings

```
GET  /api/settings              → all settings key/value pairs
POST /api/settings              → save settings (partial update ok)
```

### Export / Backup

```
GET  /api/openclaw/export       → agents + scheduler + skills snapshot
POST /api/backup                → full DB backup (downloads JSON)
POST /api/restore               → restore from backup JSON
GET  /api/backups               → list stored backup files
```

### Health

```
GET /api/health                 → { status, version, uptime, database, timestamp }
                                  No auth required — public endpoint.
GET /api/version                → { version, type }
GET /api/services               → service health for openclaw/n8n/postiz/stirling-pdf
```

---

## Canonical Deliverables Storage

All deliverables are stored at one canonical path on the server:

```
/data/deliverables/<id>_<sanitized-filename>
```

**Do not write deliverable files to:**
- `/workspace/deliverables/`
- `/workspace/output/deliverables/`
- `/workspace/reports/deliverables/`
- `/workspace/salty-os/deliverables/`

These are legacy paths. All new artifacts go through `POST /api/deliverables` only.

---

## Enforcement Rule

Before any final reply that includes a user-facing artifact (report, PDF, image, CSV, document), OpenClaw must:

1. Call `POST /api/deliverables` with the artifact
2. Confirm the response contains an `id` field
3. If registration fails, report the failure explicitly — do not silently skip it
4. Store the returned `deliverable_id` in any related kanban task or activity log entry

---

## Version History (Salty-OS)

| Version | Date | Key Changes |
|---|---|---|
| v2.4.0 | 2026-03-17 | Deliverables upload fixed (content field), inline viewer, services read from settings, logo 1.5×, preview endpoint |
| v2.3.0 | 2026-03-17 | Auth system, API keys, webhooks engine |
| v2.0.0 | 2026-03-14 | Initial OpenClaw integration, QMD memory backend |
