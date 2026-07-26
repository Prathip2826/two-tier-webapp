const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const Docker = require('dockerode');
const { getRootCauseSummary } = require('./groq');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4000;
const TARGET_URL = process.env.TARGET_URL || 'http://web:3000/health';
const TARGET_CONTAINER = process.env.TARGET_CONTAINER || 'two-tier-web';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3000);
const FAILURE_THRESHOLD = Number(process.env.FAILURE_THRESHOLD || 3);
const LATENCY_THRESHOLD_MS = Number(process.env.LATENCY_THRESHOLD_MS || 800);
const ESCALATION_THRESHOLD = Number(process.env.ESCALATION_THRESHOLD || 3);
const JENKINS_URL = process.env.JENKINS_URL || '';
const JENKINS_USER = process.env.JENKINS_USER || '';
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || '';
const JENKINS_JOB = process.env.JENKINS_JOB || 'two-tier-remediation';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ---- DB connection (reused for incident logging) ----
let db;
function connectDb() {
  db = mysql.createConnection({
    host: process.env.DB_HOST || 'db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'studentdb',
    port: process.env.DB_PORT || 3306
  });
  db.connect((err) => {
    if (err) {
      console.log('Watcher DB connection failed, retrying in 5s...', err.message);
      setTimeout(connectDb, 5000);
    } else {
      console.log('Watcher connected to MySQL');
    }
  });
  db.on('error', () => connectDb());
}
connectDb();

// ---- Rolling state ----
const state = {
  status: 'starting',      // healthy | unhealthy | recovering | starting
  latencyHistory: [],       // last 20 latency samples (ms), null = failed check
  consecutiveFailures: 0,
  restartsInWindow: [],     // timestamps of recent restarts, for escalation logic
  lastCheck: null,
  simulatingFailure: false
};

function pushLatency(ms) {
  state.latencyHistory.push({ t: Date.now(), ms });
  if (state.latencyHistory.length > 20) state.latencyHistory.shift();
}

function logIncident({ type, detail, action_taken, latency_ms, ai_summary }) {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    db.query(
      'INSERT INTO incidents (type, detail, action_taken, latency_ms, ai_summary) VALUES (?, ?, ?, ?, ?)',
      [type, detail, action_taken, latency_ms || null, ai_summary || null],
      (err, result) => {
        if (err) { console.log('Failed to log incident:', err.message); return resolve(null); }
        resolve(result.insertId);
      }
    );
  });
}

function markResolved(incidentId) {
  if (!db || !incidentId) return;
  db.query('UPDATE incidents SET resolved_at = NOW() WHERE id = ?', [incidentId]);
}

// ---- Remediation actions ----
async function restartContainer() {
  const container = docker.getContainer(TARGET_CONTAINER);
  await container.restart();
}

async function triggerJenkinsEscalation(reason) {
  if (!JENKINS_URL || !JENKINS_TOKEN) {
    console.log('Escalation needed but Jenkins is not configured (JENKINS_URL/JENKINS_TOKEN missing). Skipping.');
    return false;
  }
  try {
    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_TOKEN}`).toString('base64');
    const url = `${JENKINS_URL}/job/${JENKINS_JOB}/buildWithParameters?REASON=${encodeURIComponent(reason)}`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}` } });
    return res.ok;
  } catch (err) {
    console.log('Failed to trigger Jenkins escalation:', err.message);
    return false;
  }
}

function pruneOldRestarts() {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  state.restartsInWindow = state.restartsInWindow.filter((t) => t > fiveMinAgo);
}

// ---- Core self-healing flow ----
async function handleAnomaly(type, detail, latencyMs) {
  state.status = 'recovering';
  console.log(`[ANOMALY] ${type}: ${detail}`);

  const ai_summary = await getRootCauseSummary(type, detail).catch(() => null);
  const incidentId = await logIncident({ type, detail, action_taken: 'restart_pending', latency_ms: latencyMs, ai_summary });

  pruneOldRestarts();
  const escalate = state.restartsInWindow.length >= ESCALATION_THRESHOLD;

  try {
    if (escalate) {
      const ok = await triggerJenkinsEscalation(detail);
      if (ok) {
        console.log('[ESCALATED] Jenkins rollback pipeline triggered');
      } else {
        console.log('[FALLBACK] Escalation unavailable, restarting container directly');
        await restartContainer();
      }
    } else {
      await restartContainer();
      state.restartsInWindow.push(Date.now());
    }
    state.consecutiveFailures = 0;
    state.status = 'healthy';
    markResolved(incidentId);
    console.log('[RECOVERED] Container is back up');
  } catch (err) {
    console.log('[REMEDIATION FAILED]', err.message);
  }
}

async function checkOnce() {
  const start = Date.now();
  try {
    if (state.simulatingFailure) throw new Error('Simulated failure (demo mode)');

    const res = await fetch(TARGET_URL, { signal: AbortSignal.timeout(2000) });
    const latency = Date.now() - start;
    state.lastCheck = new Date().toISOString();

    if (!res.ok) throw new Error(`Health endpoint returned ${res.status}`);

    pushLatency(latency);
    state.consecutiveFailures = 0;

    if (latency > LATENCY_THRESHOLD_MS) {
      await handleAnomaly('HIGH_LATENCY', `Response time ${latency}ms exceeded ${LATENCY_THRESHOLD_MS}ms threshold`, latency);
    } else {
      state.status = 'healthy';
    }
  } catch (err) {
    state.lastCheck = new Date().toISOString();
    pushLatency(null);
    state.consecutiveFailures += 1;
    state.status = 'unhealthy';

    if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
      await handleAnomaly('DOWN', `App tier unreachable after ${state.consecutiveFailures} checks (${err.message})`, null);
      state.simulatingFailure = false; // clear simulated failure once handled
    }
  }
}

setInterval(checkOnce, POLL_INTERVAL_MS);

// ---- API ----
app.get('/api/status', (req, res) => {
  const recent = state.latencyHistory.filter((p) => p.ms !== null);
  const avgLatency = recent.length ? Math.round(recent.reduce((a, b) => a + b.ms, 0) / recent.length) : null;
  res.json({
    status: state.status,
    lastCheck: state.lastCheck,
    consecutiveFailures: state.consecutiveFailures,
    avgLatencyMs: avgLatency,
    latencyHistory: state.latencyHistory,
    restartsLast5Min: state.restartsInWindow.length
  });
});

app.get('/api/incidents', (req, res) => {
  if (!db) return res.json([]);
  db.query('SELECT * FROM incidents ORDER BY detected_at DESC LIMIT 25', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/simulate-failure', (req, res) => {
  state.simulatingFailure = true;
  res.json({ ok: true, message: 'Simulated failure armed. Watcher will detect and self-heal within a few checks.' });
});

app.listen(PORT, () => {
  console.log(`Watcher service running on port ${PORT}, monitoring ${TARGET_URL}`);
});
