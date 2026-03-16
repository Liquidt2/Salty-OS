// ═══════════════════════════════════════════
// SALTY OS — Backend API Server
// Express.js + PostgreSQL
// ═══════════════════════════════════════════

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, unlinkSync, copyFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, exec } from 'child_process';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const PORT = process.env.API_PORT || 3001;

// ─── Resolve repo root (works both locally and in Docker) ───
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// server/ lives one level inside the repo root
const REPO_ROOT = process.env.APP_ROOT || join(__dirname, '..');
const DATA_DIR = join(REPO_ROOT, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const SETTINGS_FALLBACK = join(DATA_DIR, 'settings.json');

// ─── Settings Helper ───
async function getSaltySettings() {
  let settings = {};
  if (existsSync(SETTINGS_FALLBACK)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_FALLBACK, 'utf-8')); } catch (e) {}
  }
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings");
    rows.forEach(r => { settings[r.key] = JSON.parse(r.value); });
  } catch (err) { /* DB down, just use file */ }
  return settings;
}

async function saveSaltySettings(entries) {
  let current = {};
  if (existsSync(SETTINGS_FALLBACK)) {
    try { current = JSON.parse(readFileSync(SETTINGS_FALLBACK, 'utf-8')); } catch (e) {}
  }
  const updated = { ...current, ...entries };
  writeFileSync(SETTINGS_FALLBACK, JSON.stringify(updated, null, 2));

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(entries)) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
    } finally { client.release(); }
  } catch (err) { console.error("DB Settings save failed, saved to file only."); }
}

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Static files for uploads ───
const UPLOADS_DIR = join(REPO_ROOT, 'public', 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Auth middleware — simple token gate
const AUTH_TOKEN = process.env.SALTY_AUTH_TOKEN || '';
const authMiddleware = (req, res, next) => {
  if (!AUTH_TOKEN) return next(); // No token set = open (dev mode)
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token === AUTH_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
};
app.use('/api', authMiddleware);

// ─── PostgreSQL Connection ───
// Try env host, then 'postgres' (docker), then 'localhost' (local dev)
const DB_HOSTS = [process.env.DB_HOST, 'postgres', 'localhost', '127.0.0.1'].filter(Boolean);
let pool = new Pool({
  host: DB_HOSTS[0],
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'saltyos',
  user: process.env.DB_USER || 'salty',
  password: process.env.DB_PASSWORD || 'saltyos_secret',
});

// Retry connection with backoff
async function connectWithRetry(retries = 10, delay = 3000) {
  for (let host of DB_HOSTS) {
    console.log(`🔌 Trying database host: ${host}...`);
    pool = new Pool({ ...pool.options, host });
    for (let i = 0; i < 3; i++) { // Try each host 3 times
      try {
        const client = await pool.connect();
        console.log(`✅ PostgreSQL connected to ${host}`);
        client.release();
        return true;
      } catch (err) {
        console.log(`⏳ Waiting for PostgreSQL on ${host}... (${i + 1}/3)`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  console.error('❌ Could not connect to any PostgreSQL host. Running in degradated mode (no DB).');
  return false;
}

// ─── Database Schema ───
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Kanban tasks
      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        agent TEXT DEFAULT '',
        tags TEXT[] DEFAULT '{}',
        due_date TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Scheduled tasks (crons)
      CREATE TABLE IF NOT EXISTS cron_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'scheduled',
        project TEXT DEFAULT 'No project',
        state TEXT NOT NULL DEFAULT 'idle',
        minute TEXT DEFAULT '*',
        hour TEXT DEFAULT '*',
        day TEXT DEFAULT '*',
        month TEXT DEFAULT '*',
        weekday TEXT DEFAULT '*',
        agent TEXT DEFAULT '',
        description TEXT DEFAULT '',
        enabled BOOLEAN DEFAULT true,
        last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Agent configs
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        department TEXT DEFAULT '',
        status TEXT DEFAULT 'idle',
        avatar TEXT DEFAULT '',
        color TEXT DEFAULT '#00E5FF',
        doc TEXT DEFAULT '',
        config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Activity logs
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        agent TEXT DEFAULT 'system',
        action TEXT NOT NULL,
        detail TEXT DEFAULT '',
        category TEXT DEFAULT 'system',
        severity TEXT DEFAULT 'info',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Deliverables
      CREATE TABLE IF NOT EXISTS deliverables (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'document',
        path TEXT DEFAULT '',
        url TEXT DEFAULT '',
        agent TEXT DEFAULT '',
        project TEXT DEFAULT '',
        size_bytes BIGINT DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Settings (key-value store)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Create updated_at trigger function
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Apply triggers
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kanban_updated') THEN
          CREATE TRIGGER kanban_updated BEFORE UPDATE ON kanban_tasks
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cron_updated') THEN
          CREATE TRIGGER cron_updated BEFORE UPDATE ON cron_tasks
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agents_updated') THEN
          CREATE TRIGGER agents_updated BEFORE UPDATE ON agents
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
      END $$;
    `);
    console.log('✅ Database schema ready');
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════

// ─── Health Check ───
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', error: err.message });
  }
});




// ─── KANBAN ───
app.get('/api/kanban', async (req, res) => {
  try {
    let rows = [];
    try {
      const dbRes = await pool.query('SELECT * FROM kanban_tasks ORDER BY created_at DESC');
      rows = dbRes.rows;
    } catch (err) { /* DB Offline — in production we could load from a backup file here */ }
    
    const board = {};
    rows.forEach(task => {
      if (!board[task.status]) board[task.status] = [];
      board[task.status].push(task);
    });
    res.json({ tasks: rows, board });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/kanban', async (req, res) => {
  const { id, title, description, status, priority, agent, tags, due_date } = req.body;
  const taskId = id || `task-${Date.now()}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO kanban_tasks (id, title, description, status, priority, agent, tags, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         status = EXCLUDED.status, priority = EXCLUDED.priority,
         agent = EXCLUDED.agent, tags = EXCLUDED.tags, due_date = EXCLUDED.due_date
       RETURNING *`,
      [taskId, title, description || '', status || 'todo', priority || 'medium', agent || '', tags || [], due_date || '']
    );
    await logActivity('system', 'kanban_update', `Task "${title}" ${id ? 'updated' : 'created'}`, 'kanban');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/kanban/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const [key, val] of Object.entries(fields)) {
      if (['title', 'description', 'status', 'priority', 'agent', 'tags', 'due_date'].includes(key)) {
        sets.push(`${key} = $${idx}`);
        vals.push(val);
        idx++;
      }
    }
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
    );
    res.json(rows[0] || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/kanban/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kanban_tasks WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk save — for drag-and-drop reordering / full board sync
app.post('/api/kanban/sync', async (req, res) => {
  const { tasks } = req.body;
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'tasks array required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of tasks) {
      await client.query(
        `INSERT INTO kanban_tasks (id, title, description, status, priority, agent, tags, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description,
           status = EXCLUDED.status, priority = EXCLUDED.priority,
           agent = EXCLUDED.agent, tags = EXCLUDED.tags, due_date = EXCLUDED.due_date`,
        [t.id, t.title, t.description || '', t.status || 'todo', t.priority || 'medium', t.agent || '', t.tags || [], t.due_date || '']
      );
    }
    await client.query('COMMIT');
    res.json({ synced: tasks.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── CRON TASKS ───
app.get('/api/crons', async (req, res) => {
  try {
    let rows = [];
    try {
      const dbRes = await pool.query('SELECT * FROM cron_tasks ORDER BY created_at DESC');
      rows = dbRes.rows;
    } catch (err) {}
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crons', async (req, res) => {
  const { id, name, type, project, state, minute, hour, day, month, weekday, agent, description, enabled } = req.body;
  const cronId = id || `cron-${Date.now()}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO cron_tasks (id, name, type, project, state, minute, hour, day, month, weekday, agent, description, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, type=EXCLUDED.type, project=EXCLUDED.project,
         state=EXCLUDED.state, minute=EXCLUDED.minute, hour=EXCLUDED.hour,
         day=EXCLUDED.day, month=EXCLUDED.month, weekday=EXCLUDED.weekday,
         agent=EXCLUDED.agent, description=EXCLUDED.description, enabled=EXCLUDED.enabled
       RETURNING *`,
      [cronId, name, type||'scheduled', project||'No project', state||'idle',
       minute||'*', hour||'*', day||'*', month||'*', weekday||'*',
       agent||'', description||'', enabled !== false]
    );
    await logActivity('system', 'cron_update', `Task "${name}" ${id ? 'updated' : 'created'}`, 'scheduler');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/crons/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  try {
    const allowed = ['name','type','project','state','minute','hour','day','month','weekday','agent','description','enabled','last_run','next_run'];
    const sets = [], vals = [];
    let idx = 1;
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) { sets.push(`${key} = $${idx}`); vals.push(val); idx++; }
    }
    vals.push(id);
    const { rows } = await pool.query(`UPDATE cron_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0] || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/crons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cron_tasks WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AGENTS ───
app.get('/api/agents', async (req, res) => {
  try {
    let rows = [];
    try {
      const dbRes = await pool.query('SELECT * FROM agents ORDER BY name');
      rows = dbRes.rows;
    } catch (err) {}
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents', async (req, res) => {
  const { id, name, role, department, status, avatar, color, doc, config } = req.body;
  const agentId = id || `agent-${Date.now()}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO agents (id, name, role, department, status, avatar, color, doc, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, role=EXCLUDED.role, department=EXCLUDED.department,
         status=EXCLUDED.status, avatar=EXCLUDED.avatar, color=EXCLUDED.color,
         doc=EXCLUDED.doc, config=EXCLUDED.config
       RETURNING *`,
      [agentId, name, role||'', department||'', status||'idle', avatar||'', color||'#00E5FF', doc||'', config||{}]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  try {
    const allowed = ['name','role','department','status','avatar','color','doc','config'];
    const sets = [], vals = [];
    let idx = 1;
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) { sets.push(`${key} = $${idx}`); vals.push(key === 'config' ? JSON.stringify(val) : val); idx++; }
    }
    vals.push(id);
    const { rows } = await pool.query(`UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0] || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ACTIVITY LOGS ───
async function logActivity(agent, action, detail, category = 'system', severity = 'info', metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (agent, action, detail, category, severity, metadata) VALUES ($1,$2,$3,$4,$5,$6)',
      [agent, action, detail, category, severity, metadata]
    );
  } catch (err) {
    console.error('Log error:', err.message);
  }
}

app.get('/api/activity', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100'), 500);
  const offset = parseInt(req.query.offset || '0');
  const agent = req.query.agent;
  const category = req.query.category;
  try {
    let query = 'SELECT * FROM activity_logs';
    const conditions = [], vals = [];
    let idx = 1;
    if (agent) { conditions.push(`agent = $${idx}`); vals.push(agent); idx++; }
    if (category) { conditions.push(`category = $${idx}`); vals.push(category); idx++; }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`;
    vals.push(limit, offset);
    const { rows } = await pool.query(query, vals);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activity', async (req, res) => {
  const { agent, action, detail, category, severity, metadata } = req.body;
  try {
    await logActivity(agent || 'system', action, detail || '', category, severity, metadata);
    res.json({ logged: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELIVERABLES ───
app.get('/api/deliverables', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM deliverables ORDER BY created_at DESC');
    // Also scan the shared volume for new files
    const delivDir = process.env.DELIVERABLES_PATH || '/app/data/deliverables';
    let files = [];
    if (existsSync(delivDir)) {
      files = readdirSync(delivDir).map(f => {
        const stat = statSync(join(delivDir, f));
        return { name: f, size_bytes: stat.size, created_at: stat.birthtime, path: join(delivDir, f) };
      });
    }
    res.json({ database: rows, filesystem: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SETTINGS ───
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSaltySettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OPENCLAW SKILLS ───
const SKILLS_DIR = process.env.OPENCLAW_SKILLS_DIR || join(REPO_ROOT, 'openclaw-skills');

app.get('/api/skills', (req, res) => {
  try {
    if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
    const files = readdirSync(SKILLS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const stat = statSync(join(SKILLS_DIR, f));
        return { name: f, size: stat.size, updated: stat.mtime };
      })
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/skills/:name', (req, res) => {
  try {
    const filename = req.params.name;
    if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Only .md files allowed' });
    const filePath = join(SKILLS_DIR, filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Skill not found' });
    const content = readFileSync(filePath, 'utf-8');
    res.json({ name: filename, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/:name', (req, res) => {
  try {
    const filename = req.params.name;
    if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Only .md files allowed' });
    if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
    
    // Support renaming by passing newName in the body
    if (req.body.newName && req.body.newName !== filename) {
      const newFilename = req.body.newName.endsWith('.md') ? req.body.newName : `${req.body.newName}.md`;
      const oldPath = join(SKILLS_DIR, filename);
      const newPath = join(SKILLS_DIR, newFilename);
      
      if (existsSync(oldPath)) {
        if (existsSync(newPath)) return res.status(409).json({ error: 'Target filename already exists' });
        renameSync(oldPath, newPath);
        if (req.body.content !== undefined) {
          writeFileSync(newPath, req.body.content, 'utf-8');
        }
        emitWebhook('skill.renamed', { oldName: filename, newName: newFilename, contentUpdated: req.body.content !== undefined });
        logActivity('system', 'skill_renamed', `Skill renamed: ${filename} → ${newFilename}`, 'skills');
        return res.json({ name: newFilename, saved: true });
      }
    }

    const filePath = join(SKILLS_DIR, filename);
    const isNew = !existsSync(filePath);
    writeFileSync(filePath, req.body.content || '', 'utf-8');
    if (isNew) {
      emitWebhook('skill.created', { name: filename });
      logActivity('system', 'skill_created', `Skill created: ${filename}`, 'skills');
    } else {
      emitWebhook('skill.updated', { name: filename });
      logActivity('system', 'skill_updated', `Skill updated: ${filename}`, 'skills');
    }
    res.json({ name: filename, saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/skills/:name', (req, res) => {
  try {
    const filename = req.params.name;
    const filePath = join(SKILLS_DIR, filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Skill not found' });
    unlinkSync(filePath);
    emitWebhook('skill.deleted', { name: filename });
    logActivity('system', 'skill_deleted', `Skill deleted: ${filename}`, 'skills');
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const entries = req.body;
    await saveSaltySettings(entries);
    res.json({ saved: Object.keys(entries).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGO UPLOAD ───
app.post('/api/settings/logo', async (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64 || !filename) return res.status(400).json({ error: 'Missing base64 or filename' });

    // Sanitize filename
    const sanitized = filename.replace(/[^a-z0-70-9.]/gi, '_').toLowerCase();
    const finalName = `${Date.now()}_${sanitized}`;
    const filePath = join(UPLOADS_DIR, finalName);

    // Write file
    const buffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
    writeFileSync(filePath, buffer);

    const logoUrl = `/uploads/${finalName}`;
    
    // Auto-update settings in DB & File
    await saveSaltySettings({ logoUrl });

    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VERSION ───
app.get('/api/version', async (req, res) => {
  try {
    // 1. Check for manual override in settings
    const settings = await getSaltySettings();
    if (settings.version) {
      return res.json({ version: settings.version, type: 'manual' });
    }

    // 2. Fallback to git info
    const git = getLocalGitInfo();
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'server', 'package.json'), 'utf-8'));
    res.json({ version: pkg.version || '1.0.0', git, type: 'git' });
  } catch (err) {
    res.json({ version: '1.0.0', error: err.message });
  }
});

const A0_SCHEDULER_DIR = process.env.A0_SCHEDULER_DIR || join(REPO_ROOT, 'a0-scheduler');
const A0_TASKS_FILE = join(A0_SCHEDULER_DIR, 'tasks.json');

function readTasks() {
  try {
    if (!existsSync(A0_TASKS_FILE)) return [];
    const data = JSON.parse(readFileSync(A0_TASKS_FILE, 'utf-8'));
    return data.tasks || [];
  } catch { return []; }
}

function writeTasks(tasks) {
  mkdirSync(A0_SCHEDULER_DIR, { recursive: true });
  writeFileSync(A0_TASKS_FILE, JSON.stringify({ tasks }, null, 2), 'utf-8');
}

// ─── BACKUP & RESTORE ───
app.post('/api/backup', async (req, res) => {
  try {
    let kanban = [], crons = [], agents = [], settings = [], activity = [];
    try {
      const [k, c, a, s, al] = await Promise.all([
        pool.query('SELECT * FROM kanban_tasks'),
        pool.query('SELECT * FROM cron_tasks'),
        pool.query('SELECT * FROM agents'),
        pool.query('SELECT * FROM settings'),
        pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000'),
      ]);
      kanban = k.rows; crons = c.rows; agents = a.rows; settings = s.rows; activity = al.rows;
    } catch (dbErr) {
      console.warn("DB offline during backup, skipping DB tables:", dbErr.message);
    }
    
    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        kanban, crons, agents, settings, activity,
        a0Tasks: readTasks(),
      },
    };
    // Save to filesystem too
    const backupDir = join(REPO_ROOT, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const filename = `salty-os-backup-${Date.now()}.json`;
    writeFileSync(join(backupDir, filename), JSON.stringify(backup, null, 2));
    await logActivity('system', 'backup_created', `Backup: ${filename}`, 'system');
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore', async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No backup data provided' });
  
  let dbRestored = false;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Clear and restore each table
      if (data.kanban) {
        await client.query('DELETE FROM kanban_tasks');
        for (const t of data.kanban) {
          await client.query(
            `INSERT INTO kanban_tasks (id,title,description,status,priority,agent,tags,due_date,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [t.id, t.title, t.description, t.status, t.priority, t.agent, t.tags, t.due_date, t.created_at]
          );
        }
      }
      if (data.crons) {
        await client.query('DELETE FROM cron_tasks');
        for (const c of data.crons) {
          await client.query(
            `INSERT INTO cron_tasks (id,name,type,project,state,minute,hour,day,month,weekday,agent,description,enabled,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [c.id,c.name,c.type,c.project,c.state,c.minute,c.hour,c.day,c.month,c.weekday,c.agent,c.description,c.enabled,c.created_at]
          );
        }
      }
      if (data.agents) {
        await client.query('DELETE FROM agents');
        for (const a of data.agents) {
          await client.query(
            `INSERT INTO agents (id,name,role,department,status,avatar,color,doc,config,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [a.id,a.name,a.role,a.department,a.status,a.avatar,a.color,a.doc,a.config,a.created_at]
          );
        }
      }
      if (data.settings) {
        await client.query('DELETE FROM settings');
          for (const s of data.settings) {
            let jsonStr;
            if (typeof s.value === "string") {
              try { JSON.parse(s.value); jsonStr = s.value; }
              catch { jsonStr = JSON.stringify(s.value); }
            } else {
              jsonStr = JSON.stringify(s.value);
            }
            await client.query("INSERT INTO settings (key,value) VALUES ($1,$2::jsonb)", [s.key, jsonStr]);
          }
      }
      await client.query('COMMIT');
      dbRestored = true;
    } catch (err) {
      await client.query('ROLLBACK');
      console.warn("DB restore failed partway, rolled back:", err.message);
    } finally {
      client.release();
    }
  } catch (dbconnErr) {
    console.warn("DB offline during restore, skipping DB tables.", dbconnErr.message);
  }

  try {
    // Also restore A0 tasks if present
    let a0Restored = false;
    if (data.a0Tasks) {
      writeTasks(data.a0Tasks);
      a0Restored = true;
    }
    
    // Always return success if we processed the file, even if DB was offline
    res.json({ 
      restored: true, 
      dbRestored, 
      a0Restored,
      tables: { kanban: data.kanban?.length, crons: data.crons?.length, agents: data.agents?.length, settings: data.settings?.length, a0Tasks: data.a0Tasks?.length } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUP LIST ───
app.get('/api/backups', async (req, res) => {
  const backupDir = join(REPO_ROOT, 'backups');
  mkdirSync(backupDir, { recursive: true });
  try {
    const files = readdirSync(backupDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = statSync(join(backupDir, f));
        return { filename: f, size: stat.size, created: stat.birthtime };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// A0 AGENTS — File-based CRUD (shared volume)
// Reads/writes /a0-agents which is bind-mounted
// to the same dir as OpenClaw's /a0/agents
// ═══════════════════════════════════════════
const A0_AGENTS_DIR = process.env.A0_AGENTS_DIR || join(REPO_ROOT, 'a0-agents');

// Helper: recursively read a directory tree
function readDirTree(dirPath, basePath = '') {
  if (!existsSync(dirPath)) return [];
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const tree = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      tree.push({ name: entry.name, path: relPath, type: 'folder', children: readDirTree(fullPath, relPath) });
    } else {
      const stat = statSync(fullPath);
      tree.push({ name: entry.name, path: relPath, type: 'file', size: stat.size });
    }
  }
  return tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// LIST all agent profiles
app.get('/api/a0/agents', (req, res) => {
  try {
    if (!existsSync(A0_AGENTS_DIR)) return res.json([]);
    const dirs = readdirSync(A0_AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const agentDir = join(A0_AGENTS_DIR, d.name);
        const jsonPath = join(agentDir, 'agent.json');
        const contextPath = join(agentDir, '_context.md');
        let config = {};
        let context = '';
        try { config = JSON.parse(readFileSync(jsonPath, 'utf-8')); } catch {}
        try { context = readFileSync(contextPath, 'utf-8'); } catch {}
        return {
          key: d.name,
          label: config.name || config.label || d.name,
          config,
          context,
          tree: readDirTree(agentDir),
        };
      });
    res.json(dirs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single agent profile with full tree
app.get('/api/a0/agents/:key', (req, res) => {
  try {
    const agentDir = join(A0_AGENTS_DIR, req.params.key);
    if (!existsSync(agentDir)) return res.status(404).json({ error: 'Agent not found' });
    const jsonPath = join(agentDir, 'agent.json');
    const contextPath = join(agentDir, '_context.md');
    let config = {};
    let context = '';
    try { config = JSON.parse(readFileSync(jsonPath, 'utf-8')); } catch {}
    try { context = readFileSync(contextPath, 'utf-8'); } catch {}
    res.json({ key: req.params.key, config, context, tree: readDirTree(agentDir) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ a specific file from an agent profile
app.get('/api/a0/agents/:key/file/*', (req, res) => {
  try {
    const filePath = join(A0_AGENTS_DIR, req.params.key, req.params[0]);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const content = readFileSync(filePath, 'utf-8');
    res.json({ path: req.params[0], content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WRITE/UPDATE a specific file in an agent profile
app.put('/api/a0/agents/:key/file/*', (req, res) => {
  try {
    const relPath = req.params[0];
    const filePath = join(A0_AGENTS_DIR, req.params.key, relPath);
    const parentDir = join(filePath, '..');
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(filePath, req.body.content || '', 'utf-8');
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new agent profile (folder + template files matching A0 structure)
app.post('/api/a0/agents', (req, res) => {
  try {
    const { key, label, role_prompt, context } = req.body;
    if (!key) return res.status(400).json({ error: 'Agent key required' });
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const agentDir = join(A0_AGENTS_DIR, safeKey);
    if (existsSync(agentDir)) return res.status(409).json({ error: 'Agent already exists' });

    mkdirSync(join(agentDir, 'prompts'), { recursive: true });

    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify({
      name: label || safeKey,
      use_main_model: true,
    }, null, 2), 'utf-8');

    writeFileSync(join(agentDir, '_context.md'),
      context || `# ${label || safeKey}\n\nAgent context goes here.\n`, 'utf-8');

    writeFileSync(join(agentDir, 'prompts', 'agent.system.main.role.md'),
      role_prompt || `# ${label || safeKey}\n\nYou are ${label || safeKey}. Define your role and capabilities here.\n`, 'utf-8');

    // Copy tool response template from agent0 if available
    const a0ToolResp = join(A0_AGENTS_DIR, 'agent0', 'prompts', 'agent.system.tool.response.md');
    if (existsSync(a0ToolResp)) {
      copyFileSync(a0ToolResp, join(agentDir, 'prompts', 'agent.system.tool.response.md'));
    } else {
      writeFileSync(join(agentDir, 'prompts', 'agent.system.tool.response.md'),
        '# Tool Response\n\nProcess tool responses and provide relevant information to the user.\n', 'utf-8');
    }

    res.json({ ok: true, key: safeKey, tree: readDirTree(agentDir) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new file/folder inside an agent profile
app.post('/api/a0/agents/:key/file', (req, res) => {
  try {
    const { path: relPath, content, isFolder } = req.body;
    if (!relPath) return res.status(400).json({ error: 'Path required' });
    const fullPath = join(A0_AGENTS_DIR, req.params.key, relPath);
    if (existsSync(fullPath)) return res.status(409).json({ error: 'Already exists' });
    if (isFolder) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content || '', 'utf-8');
    }
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE file/folder from agent profile
app.delete('/api/a0/agents/:key/file/*', (req, res) => {
  try {
    const filePath = join(A0_AGENTS_DIR, req.params.key, req.params[0]);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      rmSync(filePath, { recursive: true });
    } else {
      unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE entire agent profile
app.delete('/api/a0/agents-profile/:key', (req, res) => {
  try {
    const agentDir = join(A0_AGENTS_DIR, req.params.key);
    if (!existsSync(agentDir)) return res.status(404).json({ error: 'Agent not found' });
    if (['_example', 'agent0'].includes(req.params.key)) {
      return res.status(403).json({ error: 'Cannot delete built-in agent profile' });
    }
    rmSync(agentDir, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RENAME agent profile folder
app.put('/api/a0/agents-profile/:key/rename', (req, res) => {
  try {
    const { newKey } = req.body;
    if (!newKey) return res.status(400).json({ error: 'New key required' });
    const safeNew = newKey.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const oldDir = join(A0_AGENTS_DIR, req.params.key);
    const newDir = join(A0_AGENTS_DIR, safeNew);
    if (!existsSync(oldDir)) return res.status(404).json({ error: 'Agent not found' });
    if (existsSync(newDir)) return res.status(409).json({ error: 'Target name already exists' });
    renameSync(oldDir, newDir);
    res.json({ ok: true, key: safeNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// A0 SCHEDULER — File-based CRUD (shared volume)
// Reads/writes /a0-scheduler/tasks.json which is
// bind-mounted to OpenClaw's /a0/usr/scheduler
// ═══════════════════════════════════════════

function genUUID(len = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// LIST all tasks
app.get('/api/a0/scheduler', (req, res) => {
  try { res.json(readTasks()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single task
app.get('/api/a0/scheduler/:uuid', (req, res) => {
  try {
    const tasks = readTasks();
    const task = tasks.find(t => t.uuid === req.params.uuid);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE task (A0-native format)
app.post('/api/a0/scheduler', (req, res) => {
  try {
    const tasks = readTasks();
    const uuid = genUUID();
    const now = new Date().toISOString();
    const task = {
      uuid,
      context_id: uuid,
      state: 'idle',
      name: req.body.name || 'Untitled Task',
      system_prompt: req.body.system_prompt || '',
      prompt: req.body.prompt || '',
      attachments: req.body.attachments || [],
      project_name: req.body.project_name || null,
      project_color: req.body.project_color || null,
      created_at: now,
      updated_at: now,
      last_run: null,
      last_result: null,
      type: req.body.type || 'scheduled',
      schedule: {
        minute: req.body.schedule?.minute || '0',
        hour: req.body.schedule?.hour || '*',
        day: req.body.schedule?.day || '*',
        month: req.body.schedule?.month || '*',
        weekday: req.body.schedule?.weekday || '*',
        timezone: req.body.schedule?.timezone || 'America/Chicago',
      },
    };
    tasks.push(task);
    writeTasks(tasks);
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE task
app.put('/api/a0/scheduler/:uuid', (req, res) => {
  try {
    const tasks = readTasks();
    const idx = tasks.findIndex(t => t.uuid === req.params.uuid);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });
    const updated = { ...tasks[idx], ...req.body, updated_at: new Date().toISOString() };
    // Merge schedule fields if partial
    if (req.body.schedule) {
      updated.schedule = { ...tasks[idx].schedule, ...req.body.schedule };
    }
    tasks[idx] = updated;
    writeTasks(tasks);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE task
app.delete('/api/a0/scheduler/:uuid', (req, res) => {
  try {
    let tasks = readTasks();
    const len = tasks.length;
    tasks = tasks.filter(t => t.uuid !== req.params.uuid);
    if (tasks.length === len) return res.status(404).json({ error: 'Task not found' });
    writeTasks(tasks);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── INTEGRATED OPENCLAW EXPORT ───
// This is the "Single Source of Truth" endpoint OpenClaw calls to fetch all data
app.get('/api/openclaw/export', (req, res) => {
  try {
    // 1. Fetch Agents (profiles + files)
    let agents = [];
    if (existsSync(A0_AGENTS_DIR)) {
      agents = readdirSync(A0_AGENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const agentDir = join(A0_AGENTS_DIR, d.name);
          const jsonPath = join(agentDir, 'agent.json');
          const contextPath = join(agentDir, '_context.md');
          
          // Fix: Agent Zero/OpenClaw stores prompts in a /prompts folder
          const rolePath = join(agentDir, 'prompts', 'agent.system.main.role.md');
          
          let agentJson = '{}';
          let contextMd = '';
          let roleMd = '';
          try { agentJson = readFileSync(jsonPath, 'utf-8'); } catch {}
          try { contextMd = readFileSync(contextPath, 'utf-8'); } catch {}
          try { roleMd = readFileSync(rolePath, 'utf-8'); } catch {}
          return { key: d.name, agentJson, contextMd, roleMd };
        });
    }

    // 2. Fetch Scheduler Tasks
    const scheduler = { tasks: readTasks() };

    // 3. Fetch Skills
    let skills = [];
    if (existsSync(SKILLS_DIR)) {
      skills = readdirSync(SKILLS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f,
          content: readFileSync(join(SKILLS_DIR, f), 'utf-8')
        }));
    }

    res.json({ 
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      agents, 
      scheduler, 
      skills 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SERVICE PROXY — OpenClaw ───
// ─── AGENT ZERO SESSION MANAGEMENT (Login + CSRF) ───
const a0Session = { cookie: null, csrfToken: null, lastRefresh: 0 };
const A0_URL = process.env.AGENT_ZERO_URL || 'http://agent-zero:80';
const A0_USER = process.env.A0_AUTH_LOGIN || 'admin';
const A0_PASS = process.env.A0_AUTH_PASSWORD || 'admin';

async function getA0Session() {
  const now = Date.now();
  // Reuse session for 10 minutes
  if (a0Session.csrfToken && (now - a0Session.lastRefresh) < 600000) {
    return a0Session;
  }
  try {
    // Step 1: Login to get session cookie
    const loginResp = await fetch(`${A0_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(A0_USER)}&password=${encodeURIComponent(A0_PASS)}`,
      redirect: 'manual', // Don't follow redirect, just capture cookies
    });
    const loginCookies = loginResp.headers.getSetCookie?.() || [];
    const cookieStr = loginCookies.map(c => c.split(';')[0]).join('; ');
    if (!cookieStr) {
      console.error('A0 login: no session cookie returned');
      return a0Session;
    }
    console.log('A0 login: session established');

    // Step 2: Get CSRF token using authenticated session
    const csrfResp = await fetch(`${A0_URL}/csrf_token`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Cookie': cookieStr },
    });
    // The CSRF response returns an UPDATED session cookie with CSRF embedded
    // Use ONLY this cookie (it supersedes the login cookie)
    const csrfCookies = csrfResp.headers.getSetCookie?.() || [];
    const csrfCookieStr = csrfCookies.map(c => c.split(';')[0]).join('; ') || cookieStr;

    const data = await csrfResp.json();
    a0Session.cookie = csrfCookieStr;
    a0Session.csrfToken = data.csrf_token || data.token;
    a0Session.lastRefresh = now;
    console.log('A0 CSRF token acquired:', !!a0Session.csrfToken);
    return a0Session;
  } catch (err) {
    console.error('A0 session setup failed:', err.message);
    return a0Session;
  }
}

// ─── SERVICE PROXY — Agent Zero ───
app.all('/api/proxy/agent-zero/*', async (req, res) => {
  const path = req.params[0] || '';
  const targetUrl = `${A0_URL}/${path}`;
  try {
    // Get authenticated session with CSRF token
    const session = await getA0Session();
    const headers = { 'Content-Type': 'application/json' };
    if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
    if (session.cookie) headers['Cookie'] = session.cookie;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      ...(req.method !== 'GET' ? { body: JSON.stringify(req.body) } : {}),
    });

    // If CSRF failed, refresh token and retry once
    if (response.status === 403) {
      a0Session.lastRefresh = 0;
      const retrySession = await getA0Session();
      const retryHeaders = { 'Content-Type': 'application/json' };
      if (retrySession.csrfToken) retryHeaders['X-CSRF-Token'] = retrySession.csrfToken;
      if (retrySession.cookie) retryHeaders['Cookie'] = retrySession.cookie;

      const retryResp = await fetch(targetUrl, {
        method: req.method,
        headers: retryHeaders,
        ...(req.method !== 'GET' ? { body: JSON.stringify(req.body) } : {}),
      });
      const retryText = await retryResp.text();
      try { return res.status(retryResp.status).json(JSON.parse(retryText)); }
      catch { return res.status(retryResp.status).send(retryText); }
    }

    const text = await response.text();
    try { res.status(response.status).json(JSON.parse(text)); }
    catch { res.status(response.status).send(text); }
  } catch (err) {
    res.status(502).json({ error: `OpenClaw unreachable: ${err.message}` });
  }
});

// ─── SERVICE PROXY — n8n ───
app.all('/api/proxy/n8n/*', async (req, res) => {
  const targetUrl = `${process.env.N8N_URL || 'http://n8n:5678'}${req.params[0] ? '/' + req.params[0] : ''}`;
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      ...(req.method !== 'GET' ? { body: JSON.stringify(req.body) } : {}),
    });
    const data = await response.json().catch(() => response.text());
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `n8n unreachable: ${err.message}` });
  }
});

// ─── SERVICE STATUS ───
app.get('/api/services', async (req, res) => {
  const services = {
    'agent-zero': process.env.AGENT_ZERO_URL || 'http://agent-zero:80',
    'n8n': process.env.N8N_URL || 'http://n8n:5678',
    'postiz': process.env.POSTIZ_URL || 'http://postiz:5000',
    'gotenberg': process.env.GOTENBERG_URL || 'http://gotenberg:3100',
    'firecrawl': process.env.FIRECRAWL_URL || 'http://firecrawl:3002',
    'stirling-pdf': process.env.STIRLING_URL || 'http://stirling-pdf:8080',
  };
  const results = {};
  await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`${url}/`, { signal: controller.signal });
        results[name] = { status: 'online', code: resp.status, url };
      } catch {
        results[name] = { status: 'offline', url };
      }
    })
  );
  res.json(results);
});

// ═══════════════════════════════════════════
// UPDATE SYSTEM — GitHub API + safe git pull
// ═══════════════════════════════════════════

// Helper: get local git info
function getLocalGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const short  = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const msg    = execSync('git log -1 --pretty=%s', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    const date   = execSync('git log -1 --pretty=%ci', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    return { commit, short, branch, message: msg, date, error: null };
  } catch (err) {
    return { commit: null, short: null, branch: 'main', message: null, date: null, error: err.message };
  }
}

// GET /api/update/status — current local git state
app.get('/api/update/status', (req, res) => {
  res.json(getLocalGitInfo());
});

// GET /api/update/check — compare local HEAD to GitHub remote
app.get('/api/update/check', async (req, res) => {
  try {
    const local = getLocalGitInfo();

    // Get repo from settings (fall back to env or default)
    let repo = process.env.GITHUB_REPO || 'Liquidt2/Salty-OS';
    try {
      const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'githubRepo'");
      if (rows[0]?.value) repo = String(rows[0].value).replace(/^"|"$/g, '');
    } catch { /* DB may not be available; use default */ }

    const branch = local.branch || 'main';

    // Call GitHub API (60 req/hour unauthenticated; set GITHUB_TOKEN env to raise limit)
    const ghHeaders = { 'User-Agent': 'SaltyOS-Updater', Accept: 'application/vnd.github.v3+json' };
    if (process.env.GITHUB_TOKEN) ghHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const ghRes = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, { headers: ghHeaders });

    if (!ghRes.ok) {
      return res.json({ local, remote: null, upToDate: true, error: `GitHub API returned ${ghRes.status}` });
    }

    const ghData = await ghRes.json();
    const remoteCommit = ghData.sha || '';
    const remoteShort  = remoteCommit.slice(0, 7);
    const remoteMsg    = ghData.commit?.message?.split('\n')[0] || '';
    const remoteDate   = ghData.commit?.author?.date || '';
    const remoteAuthor = ghData.commit?.author?.name || '';

    res.json({
      local,
      remote: { commit: remoteCommit, short: remoteShort, message: remoteMsg, date: remoteDate, author: remoteAuthor },
      upToDate: local.commit === remoteCommit,
      repo,
      branch,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/update/apply — auto-backup → git pull → log result
app.post('/api/update/apply', async (req, res) => {
  const steps = [];
  const log = (msg) => { steps.push(msg); console.log('[UPDATE]', msg); };

  try {
    log('Starting update — creating safety backup first...');

    // Step 1: auto-backup all DB data (same logic as /api/backup)
    let backupFile = null;
    try {
      const [kanban, crons, agents, settings, activity] = await Promise.all([
        pool.query('SELECT * FROM kanban_tasks'),
        pool.query('SELECT * FROM cron_tasks'),
        pool.query('SELECT * FROM agents'),
        pool.query('SELECT * FROM settings'),
        pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1000'),
      ]);
      const backup = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        triggeredBy: 'auto-update',
        data: { kanban: kanban.rows, crons: crons.rows, agents: agents.rows, settings: settings.rows, activity: activity.rows },
      };
      const backupDir = join(REPO_ROOT, 'backups');
      mkdirSync(backupDir, { recursive: true });
      backupFile = join(backupDir, `pre-update-${Date.now()}.json`);
      writeFileSync(backupFile, JSON.stringify(backup, null, 2));
      log(`✅ Backup saved: ${backupFile}`);
    } catch (dbErr) {
      log(`⚠️  DB backup skipped (DB may be offline): ${dbErr.message}`);
    }

    // Step 2: stash any local changes to avoid conflicts
    try {
      execSync('git stash --include-untracked', { cwd: REPO_ROOT, encoding: 'utf-8' });
      log('📦 Local changes stashed (will be restored after pull)');
    } catch { log('ℹ️  Nothing to stash'); }

    // Step 3: git pull
    log('⬇️  Running git pull...');
    const pullOutput = execSync('git pull --ff-only', { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 30000 }).trim();
    log(`✅ git pull: ${pullOutput}`);

    // Step 4: restore stash if we stashed anything
    try {
      execSync('git stash pop', { cwd: REPO_ROOT, encoding: 'utf-8' });
      log('✅ Local changes restored from stash');
    } catch { log('ℹ️  No stash to restore'); }

    // Step 5: get new commit info
    const newInfo = getLocalGitInfo();
    log(`🆕 Now at commit ${newInfo.short}: ${newInfo.message}`);

    // Log to activity
    try { await logActivity('system', 'update_applied', `Updated to ${newInfo.short}: ${newInfo.message}`, 'system'); } catch {}

    res.json({ success: true, steps, newCommit: newInfo, backupFile });

  } catch (err) {
    log(`❌ Update failed: ${err.message}`);
    // Attempt to restore stash on failure
    try { execSync('git stash pop', { cwd: REPO_ROOT, encoding: 'utf-8' }); log('↩️  Rolled back local changes from stash'); } catch {}
    res.status(500).json({ success: false, error: err.message, steps });
  }
});

// ─── SEED DATA ───
async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM agents');
  if (parseInt(rows[0].count) > 0) return;
  console.log('🌱 Seeding initial data...');

  // Seed agents
  const agents = [
    { id: 'klaus', name: 'Klaus', role: 'Chief Operating Officer', department: 'Executive', avatar: '🎩', color: '#00E5FF' },
    { id: 'axel', name: 'Axel', role: 'Lead Generation Specialist', department: 'Sales', avatar: '🎯', color: '#FF5252' },
    { id: 'nova', name: 'Nova', role: 'Content & Social Media Manager', department: 'Marketing', avatar: '✨', color: '#B388FF' },
    { id: 'vex', name: 'Vex', role: 'Outreach & Email Specialist', department: 'Sales', avatar: '📧', color: '#FFAB40' },
    { id: 'echo', name: 'Echo', role: 'Market Research Analyst', department: 'Operations', avatar: '📊', color: '#00E676' },
    { id: 'cipher', name: 'Cipher', role: 'Systems & Integration Engineer', department: 'Engineering', avatar: '🔧', color: '#64B5F6' },
    { id: 'drift', name: 'Drift', role: 'Carrier Relations Manager', department: 'Operations', avatar: '🚛', color: '#FFB300' },
    { id: 'pulse', name: 'Pulse', role: 'Analytics & Reporting', department: 'Operations', avatar: '📈', color: '#FF80AB' },
    { id: 'sage', name: 'Sage', role: 'Compliance & Documentation', department: 'Operations', avatar: '📋', color: '#80CBC4' },
  ];
  for (const a of agents) {
    await pool.query(
      'INSERT INTO agents (id,name,role,department,avatar,color) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [a.id, a.name, a.role, a.department, a.avatar, a.color]
    );
  }

  // Seed cron tasks
  const crons = [
    { id: 'cron-1', name: 'Daily Prospect Scrape', type: 'scheduled', project: 'Lead Generation', state: 'idle', minute: '0', hour: '6', agent: 'axel', description: 'Scrape Apollo.io for new manufacturing leads' },
    { id: 'cron-2', name: 'Social Media Post', type: 'scheduled', project: 'Marketing', state: 'running', minute: '0', hour: '9,14', weekday: '1-5', agent: 'nova', description: 'Auto-publish scheduled content' },
    { id: 'cron-3', name: 'Market Rate Check', type: 'scheduled', project: 'Operations', state: 'idle', minute: '0', hour: '7', weekday: '1-5', agent: 'echo', description: 'Pull DAT/Truckstop rate data' },
    { id: 'cron-4', name: 'Email Follow-up', type: 'scheduled', project: 'Lead Generation', state: 'disabled', minute: '0', hour: '8', weekday: '1-5', agent: 'vex', description: 'Send follow-up sequences' },
    { id: 'cron-5', name: 'Weekly Freight Report', type: 'scheduled', project: 'Operations', state: 'idle', minute: '0', hour: '16', weekday: '5', agent: 'echo', description: 'Generate weekly market analysis PDF' },
  ];
  for (const c of crons) {
    await pool.query(
      `INSERT INTO cron_tasks (id,name,type,project,state,minute,hour,day,month,weekday,agent,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'*','*',$8,$9,$10) ON CONFLICT DO NOTHING`,
      [c.id, c.name, c.type, c.project, c.state, c.minute, c.hour, c.weekday||'*', c.agent, c.description]
    );
  }

  // Seed settings
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('company', $1) ON CONFLICT DO NOTHING`,
    [JSON.stringify({ name: 'BKE Logistics LLC', title: 'Freight Brokerage', accentColor: '#00E5FF' })]
  );

  await logActivity('system', 'seed', 'Initial data seeded', 'system');
  console.log('✅ Seed data loaded');
}

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
async function start() {
  const connected = await connectWithRetry();
  if (connected) {
    await initDatabase();
    await seedIfEmpty();
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🧂 Salty OS API running on port ${PORT}`);
    console.log(`   Database: ${connected ? '✅ connected' : '❌ disconnected'}`);
    console.log(`   Auth: ${AUTH_TOKEN ? '🔒 enabled' : '🔓 open (set SALTY_AUTH_TOKEN)'}`);
  });
}

start();
