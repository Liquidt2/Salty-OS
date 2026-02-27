// ═══════════════════════════════════════════
// SALTY OS — Backend API Server
// Express.js + PostgreSQL
// ═══════════════════════════════════════════

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, unlinkSync, copyFileSync, renameSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const PORT = process.env.API_PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'saltyos',
  user: process.env.DB_USER || 'salty',
  password: process.env.DB_PASSWORD || 'saltyos_secret',
});

// Retry connection with backoff
async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');
      client.release();
      return true;
    } catch (err) {
      console.log(`⏳ Waiting for PostgreSQL... (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('❌ Could not connect to PostgreSQL');
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

// ─── VERSION ───
app.get('/api/version', async (req, res) => {
  try {
    const pkg = require('/app/package.json');
    res.json({
      name: pkg.name || 'salty-os',
      version: pkg.version || '1.0.0',
      buildTime: process.env.BUILD_TIME || null,
      node: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.json({ name: 'salty-os', version: '1.0.0', error: err.message });
  }
});


// ─── KANBAN ───
app.get('/api/kanban', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM kanban_tasks ORDER BY created_at DESC');
    // Group by status for frontend
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
    const { rows } = await pool.query('SELECT * FROM cron_tasks ORDER BY created_at DESC');
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
    const { rows } = await pool.query('SELECT * FROM agents ORDER BY name');
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
    const { rows } = await pool.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const entries = req.body; // { key: value, key: value, ... }
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
    res.json({ saved: Object.keys(entries).length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── BACKUP & RESTORE ───
app.post('/api/backup', async (req, res) => {
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
      data: {
        kanban: kanban.rows,
        crons: crons.rows,
        agents: agents.rows,
        settings: settings.rows,
        activity: activity.rows,
      },
    };
    // Save to filesystem too
    const backupDir = '/app/backups';
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
            // if it is already JSON, keep it; otherwise wrap as JSON string
            try { JSON.parse(s.value); jsonStr = s.value; }
            catch { jsonStr = JSON.stringify(s.value); }
          } else {
            jsonStr = JSON.stringify(s.value);
          }
          await client.query("INSERT INTO settings (key,value) VALUES ($1,$2::jsonb)", [s.key, jsonStr]);
        }
    }
    await client.query('COMMIT');
    await logActivity('system', 'backup_restored', 'Full restore completed', 'system');
    res.json({ restored: true, tables: { kanban: data.kanban?.length, crons: data.crons?.length, agents: data.agents?.length, settings: data.settings?.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── BACKUP LIST ───
app.get('/api/backups', async (req, res) => {
  const backupDir = '/app/backups';
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
// to the same dir as Agent Zero's /a0/agents
// ═══════════════════════════════════════════
const A0_AGENTS_DIR = process.env.A0_AGENTS_DIR || '/a0-agents';

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
// bind-mounted to Agent Zero's /a0/usr/scheduler
// ═══════════════════════════════════════════
const A0_SCHEDULER_DIR = process.env.A0_SCHEDULER_DIR || '/a0-scheduler';
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

// ─── SERVICE PROXY — Agent Zero ───
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
    res.status(502).json({ error: `Agent Zero unreachable: ${err.message}` });
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

// ─── UPDATE TRIGGER ───
app.post('/api/update/check', async (req, res) => {
  try {
    const result = execSync('cd /app && git fetch origin main --dry-run 2>&1', { encoding: 'utf-8', timeout: 10000 });
    const behind = result.includes('main') || result.trim().length > 0;
    res.json({ updateAvailable: behind, output: result.trim() });
  } catch (err) {
    res.json({ updateAvailable: false, error: err.message });
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
