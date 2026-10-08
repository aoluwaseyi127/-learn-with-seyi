const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || !DATABASE_URL) {
  console.error('Missing DATABASE_URL or JWT_SECRET environment variable.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', err => console.error('Database pool error (ignored):', err.message));
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));

// The frontend is hosted on Netlify while this API runs on Railway/Render.
// Set FRONTEND_URL to the Netlify URL (or comma-separated URLs) in production.
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(x => x.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

['index.html', 'admin.html', 'config.js'].forEach(f => {
  app.get('/' + f, (_req, res) => res.sendFile(path.join(__dirname, f)));
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      progress JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ`);
  if (ADMIN_EMAIL) await pool.query("UPDATE users SET role='admin' WHERE email=$1", [ADMIN_EMAIL]);
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT id,name,email,role,progress FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
    req.user = rows[0];
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.post('/api/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || name.length > 120) return res.status(400).json({ error: 'Enter a valid name.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password needs 6+ characters.' });
    const hash = await bcrypt.hash(password, 12);
    const role = ADMIN_EMAIL && email === ADMIN_EMAIL ? 'admin' : 'student';
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,progress',
      [id, name, email, hash, role]
    );
    const user = rows[0];
    res.status(201).json({ token: tokenFor(user), name: user.name, progress: user.progress, role: user.role });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'This email already has an account — log in instead.' });
    console.error(e);
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    await pool.query('UPDATE users SET last_login_at=NOW(), last_activity_at=NOW() WHERE id=$1', [user.id]);
    res.json({ token: tokenFor(user), name: user.name, progress: user.progress, role: user.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.post('/api/logout', (_req, res) => res.json({ ok: true }));

app.get('/api/progress', auth, (req, res) => res.json(req.user.progress || {}));
app.put('/api/progress', auth, async (req, res) => {
  try {
    const progress = req.body && typeof req.body === 'object' ? req.body : {};
    await pool.query('UPDATE users SET progress=$1::jsonb, last_activity_at=NOW() WHERE id=$2', [JSON.stringify(progress), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

app.get('/api/admin/stats', auth, adminOnly, async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
      COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active7d,
      COUNT(*) FILTER (WHERE progress <> '{}'::jsonb)::int AS "withProgress"
    FROM users
  `);
  res.json(rows[0]);
});

function progressSummary(progress) {
  const p = progress || {};
  const best = p.best || {};
  const exam = p.exam || {};
  const lvl = p.lvl || {};
  const wr = p.wr || {};
  const languages = ['en', 'fr'];
  const levels = ['A1','A2','B1','B2','C1'];
  const modules = 6;
  const moduleScores = {};
  languages.forEach(lang => {
    const keys = Object.keys(best).filter(k => k.startsWith(lang));
    moduleScores[lang] = {
      completed: keys.filter(k => Number(best[k]) >= 50).length,
      attempted: keys.length,
      average: keys.length ? Math.round(keys.reduce((a,k)=>a + Number(best[k] || 0),0) / keys.length) : 0,
      total: modules * levels.length
    };
  });
  const examResults = {};
  languages.forEach(lang => {
    examResults[lang] = levels.map(level => ({ level, score: exam[lang + level] ?? null, passed: Number(exam[lang + level] || 0) >= 70 }));
  });
  const allModuleKeys = languages.flatMap(lang => Object.keys(best).filter(k => k.startsWith(lang)));
  const completedModules = allModuleKeys.filter(k => Number(best[k]) >= 50).length;
  const totalModules = modules * levels.length * languages.length;
  const examsTaken = languages.flatMap(lang => levels.map(level => exam[lang + level])).filter(v => v != null).length;
  const examsPassed = languages.flatMap(lang => levels.map(level => exam[lang + level])).filter(v => Number(v) >= 70).length;
  const writingCompleted = Object.keys(wr).length;
  return {
    xp: Number(p.xp || 0),
    placement: lvl,
    modulesCompleted: completedModules,
    modulesAttempted: allModuleKeys.length,
    modulesTotal: totalModules,
    completion: Math.round((completedModules / totalModules) * 100),
    examsTaken, examsPassed,
    writingCompleted,
    moduleScores,
    examResults
  };
}

app.get('/api/admin/users', auth, adminOnly, async (_req, res) => {
  const { rows } = await pool.query('SELECT id,name,email,role,created_at,last_login_at,last_activity_at,progress FROM users ORDER BY created_at DESC');
  res.json(rows.map(x => ({ ...x, summary: progressSummary(x.progress) })));
});

app.get('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,email,role,created_at,last_login_at,last_activity_at,progress FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Student not found.' });
  const u = rows[0];
  res.json({ ...u, summary: progressSummary(u.progress) });
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own admin account here.' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Learn with Seyi running on port ${PORT}`));
}).catch(err => {
  console.error('Database initialisation failed:', err);
  process.exit(1);
});
