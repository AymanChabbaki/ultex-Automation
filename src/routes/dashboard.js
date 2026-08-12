const express = require('express');
const { basicAuth } = require('../middleware/basicAuth');
const eventLog = require('../services/eventLog');
const blocklist = require('../services/blocklist');
const clients = require('../services/clients');
const { deleteComment } = require('../services/facebook');

const router = express.Router();
router.use(basicAuth);

// Every route here is scoped to one client -- loads it once per request
// and 404s up front for an unknown ID, rather than every handler
// re-checking.
router.param('clientId', (req, res, next, clientId) => {
  const client = clients.get(clientId);
  if (!client) return res.status(404).send('Unknown client');
  req.client = client;
  next();
});

router.get('/clients/:clientId/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  res.json({ stats: eventLog.stats(req.client.id), events: eventLog.list(req.client.id, limit) });
});

// Manual delete, for when the moderation model missed a comment it
// should have flagged. Same Graph API call the automatic path uses,
// triggered by a human from the dashboard instead of a webhook event.
// Also blocklists the author, same as an AI-caught delete, so a human
// catching what the model missed still prevents their next comment.
router.post('/clients/:clientId/api/events/:commentId/delete', async (req, res) => {
  const client = req.client;
  const { commentId } = req.params;
  const entry = eventLog.getByCommentId(client.id, commentId);

  if (!entry) {
    return res.status(404).json({ success: false, error: 'Unknown comment ID' });
  }
  if (entry.deleted) {
    return res.json({ success: true, event: entry });
  }

  const token = entry.platform === 'instagram' ? client.igAccessToken : client.pageAccessToken;
  const result = await deleteComment(commentId, entry.platform, token);
  if (!result.ok) {
    return res.status(502).json({ success: false, error: result.error });
  }

  const updated = eventLog.markDeleted(client.id, commentId);
  if (entry.authorId) {
    blocklist.block(client.id, entry.platform, entry.authorId, entry.author, commentId);
  }
  res.json({ success: true, event: updated });
});

router.get('/clients/:clientId/api/blocklist', (req, res) => {
  res.json({ blocked: blocklist.list(req.client.id) });
});

router.post('/clients/:clientId/api/blocklist/unblock', (req, res) => {
  const { platform, authorId } = req.body || {};
  if (!platform || !authorId) {
    return res.status(400).json({ success: false, error: 'platform and authorId are required' });
  }
  const existed = blocklist.unblock(req.client.id, platform, authorId);
  res.json({ success: existed });
});

router.get('/clients/:clientId/dashboard', (req, res) => {
  res.type('html').send(DASHBOARD_HTML.replace(/\{\{CLIENT_NAME\}\}/g, req.client.name));
});

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{CLIENT_NAME}} &ndash; Comment Moderation</title>
<script>
  // Runs before first paint so there's no flash of the wrong theme.
  (function () {
    var saved = localStorage.getItem('moderation-theme');
    var theme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0d12;
    --panel: #151822;
    --panel-2: #1b1f2b;
    --border: #262b38;
    --text: #eceef2;
    --muted: #8b93a3;
    --accent: #5b8def;
    --delete: #f0555b;
    --keep: #34b874;
    --error: #f0a83b;
    --fb: #5b8def;
    --ig: #d65cc9;
    --radius: 10px;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #f6f7f9;
    --panel: #ffffff;
    --panel-2: #f0f2f5;
    --border: #e3e6eb;
    --text: #1a1d24;
    --muted: #6b7280;
    --accent: #3b6fe0;
    --delete: #d23a40;
    --keep: #1f9d55;
    --error: #b8790f;
    --fb: #3b6fe0;
    --ig: #b83fa8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 28px 32px 60px;
    transition: background 0.15s, color 0.15s;
  }
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .theme-toggle:hover { border-color: var(--accent); }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 22px;
  }
  h1 { font-size: 19px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  h1 span.sub { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 10px; }
  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .live .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--keep);
    box-shadow: 0 0 0 0 rgba(52,184,116,0.5);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(52,184,116,0.45); }
    70% { box-shadow: 0 0 0 6px rgba(52,184,116,0); }
    100% { box-shadow: 0 0 0 0 rgba(52,184,116,0); }
  }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
  }
  .stat .value { font-size: 24px; font-weight: 700; line-height: 1.2; }
  .stat .label { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .stat.accent-delete .value { color: var(--delete); }
  .stat.accent-keep .value { color: var(--keep); }
  .stat.accent-error .value { color: var(--error); }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    margin-bottom: 20px;
  }
  .panel-title {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 12px;
  }
  #chart { width: 100%; height: 90px; display: block; overflow: visible; }
  #chart rect { transition: opacity 0.1s; }
  #chart rect:hover { opacity: 0.75; }
  .chart-legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: var(--muted); }
  .chart-legend .sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .toolbar select, .toolbar input {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
  }
  .toolbar input[type="search"] { flex: 1; min-width: 160px; }
  .toolbar button {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 7px;
    padding: 7px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .toolbar button:hover { border-color: var(--accent); }
  .count-hint { color: var(--muted); font-size: 12px; margin-left: auto; }

  .presets { display: flex; gap: 4px; }
  .presets button {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 7px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .presets button:hover { border-color: var(--accent); color: var(--text); }
  .presets button.active { border-color: var(--accent); color: var(--text); background: rgba(91,141,239,0.12); }
  .date-sep { color: var(--muted); font-size: 12px; }

  .delete-btn {
    background: transparent;
    border: 1px solid var(--delete);
    color: var(--delete);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .delete-btn:hover { background: rgba(240,85,91,0.12); }
  .delete-btn:disabled { opacity: 0.5; cursor: default; }
  .manual-tag { color: var(--muted); font-size: 11px; font-weight: 400; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
  th, td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--panel-2); }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; background: var(--panel); }
  td.time { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.author { white-space: nowrap; color: var(--muted); }
  td.text { max-width: 420px; }
  td.text .full { white-space: pre-wrap; word-break: break-word; }
  td.text .err { color: var(--error); font-size: 12px; margin-top: 4px; }

  .platform-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .platform-badge.facebook { background: rgba(91,141,239,0.15); color: var(--fb); }
  .platform-badge.instagram { background: rgba(214,92,201,0.15); color: var(--ig); }
  .platform-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .badge {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .badge.DELETE { background: rgba(240,85,91,0.15); color: var(--delete); }
  .badge.KEEP { background: rgba(52,184,116,0.15); color: var(--keep); }
  .badge.ERROR { background: rgba(240,168,59,0.15); color: var(--error); }

  .deleted-yes { color: var(--delete); font-weight: 600; }
  .deleted-no { color: var(--muted); }
  .blocked-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    background: rgba(240,85,91,0.1);
    color: var(--delete);
    border: 1px solid rgba(240,85,91,0.3);
  }

  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 50px 0; text-align: center; font-size: 13px; }

  details.panel summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  details.panel summary::-webkit-details-marker { display: none; }
  details.panel summary .panel-title { margin-bottom: 0; }
  details.panel[open] summary { margin-bottom: 12px; }
  details.panel summary .chev { color: var(--muted); font-size: 12px; transition: transform 0.15s; }
  details.panel[open] summary .chev { transform: rotate(90deg); }
  .blocklist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .blocklist-table td, .blocklist-table th { padding: 8px 6px; border-bottom: 1px solid var(--border); text-align: left; }
  .blocklist-table th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }
  .blocklist-table tr:last-child td { border-bottom: none; }
  .unblock-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .unblock-btn:hover { border-color: var(--accent); color: var(--text); }
</style>
</head>
<body>
  <header>
    <h1>{{CLIENT_NAME}}<span class="sub">Comment Moderation &middot; Facebook &amp; Instagram</span></h1>
    <div style="display:flex; align-items:center; gap:14px;">
      <span class="live"><span class="dot"></span><span id="updated">Loading&hellip;</span></span>
      <button class="theme-toggle" id="themeToggle" type="button"><span id="themeIcon">&#9728;</span> <span id="themeLabel">Light</span></button>
    </div>
  </header>

  <div class="stats" id="stats"></div>

  <details class="panel" id="blocklistPanel">
    <summary>
      <span class="panel-title">Blocked authors (<span id="blockedCount">0</span>)</span>
      <span class="chev">&#9656;</span>
    </summary>
    <table class="blocklist-table">
      <thead>
        <tr><th>Platform</th><th>Author</th><th>Blocked</th><th style="width:80px"></th></tr>
      </thead>
      <tbody id="blocklistRows"></tbody>
    </table>
    <div class="empty" id="blocklistEmpty" style="display:none; padding: 16px 0;">No blocked authors yet -- they're added automatically the first time one of their comments is deleted.</div>
  </details>

  <div class="panel">
    <div class="panel-title">Activity, last 24h</div>
    <svg id="chart" viewBox="0 0 960 90" preserveAspectRatio="none"></svg>
    <div class="chart-legend">
      <span><span class="sw" style="background:var(--delete)"></span>Deleted</span>
      <span><span class="sw" style="background:var(--keep)"></span>Kept</span>
    </div>
  </div>

  <div class="toolbar">
    <select id="platformFilter">
      <option value="">All platforms</option>
      <option value="facebook">Facebook</option>
      <option value="instagram">Instagram</option>
    </select>
    <select id="verdictFilter">
      <option value="">All verdicts</option>
      <option value="DELETE">Deleted</option>
      <option value="KEEP">Kept</option>
      <option value="ERROR">Errors</option>
    </select>
    <input type="search" id="search" placeholder="Search comment text or author&hellip;">
    <button id="refreshBtn" type="button">Refresh</button>
  </div>

  <div class="toolbar">
    <div class="presets" id="datePresets">
      <button type="button" data-days="1">Today</button>
      <button type="button" data-days="7">7 days</button>
      <button type="button" data-days="30">30 days</button>
      <button type="button" data-days="0" class="active">All time</button>
    </div>
    <input type="date" id="dateFrom">
    <span class="date-sep">&ndash;</span>
    <input type="date" id="dateTo">
    <span class="count-hint" id="countHint"></span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:110px">Time</th>
          <th style="width:110px">Platform</th>
          <th style="width:130px">Author</th>
          <th>Comment</th>
          <th style="width:90px">Verdict</th>
          <th style="width:110px">Deleted</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <div class="empty" id="empty" style="display:none">No comments match the current filters.</div>

<script>
let allEvents = [];

function applyThemeUi() {
  const theme = document.documentElement.getAttribute('data-theme');
  document.getElementById('themeIcon').innerHTML = theme === 'light' ? '&#9728;' : '&#9789;';
  document.getElementById('themeLabel').textContent = theme === 'light' ? 'Light' : 'Dark';
}
applyThemeUi();

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('moderation-theme', next);
  applyThemeUi();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

async function loadBlocklist() {
  const res = await fetch('api/blocklist');
  if (!res.ok) return;
  const { blocked } = await res.json();

  document.getElementById('blockedCount').textContent = blocked.length;
  const rowsEl = document.getElementById('blocklistRows');
  const emptyEl = document.getElementById('blocklistEmpty');

  if (blocked.length === 0) {
    rowsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  rowsEl.innerHTML = blocked.map((b) => {
    return '<tr>' +
      '<td>' + platformBadge(b.platform) + '</td>' +
      '<td>' + (b.authorName ? escapeHtml(b.authorName) : '<span class="muted">' + escapeHtml(b.authorId) + '</span>') + '</td>' +
      '<td class="muted" title="' + new Date(b.blockedAt).toLocaleString() + '">' + relativeTime(b.blockedAt) + '</td>' +
      '<td><button class="unblock-btn" data-platform="' + escapeHtml(b.platform) + '" data-author-id="' + escapeHtml(b.authorId) + '" type="button">Unblock</button></td>' +
      '</tr>';
  }).join('');
}

document.getElementById('blocklistRows').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.unblock-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Unblocking…';
  try {
    await fetch('api/blocklist/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: btn.dataset.platform, authorId: btn.dataset.authorId }),
    });
    await loadBlocklist();
  } catch (err) {
    alert('Failed to unblock: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Unblock';
  }
});

function platformBadge(p) {
  if (p === 'instagram') return '<span class="platform-badge instagram"><span class="dot"></span>Instagram</span>';
  if (p === 'facebook') return '<span class="platform-badge facebook"><span class="dot"></span>Facebook</span>';
  return '<span class="muted">&mdash;</span>';
}

function renderStats(stats) {
  const rate = stats.total ? Math.round((stats.deleted / stats.total) * 100) : 0;
  const cards = [
    ['value', 'Total', stats.total],
    ['accent-delete', 'Deleted', stats.deleted],
    ['accent-keep', 'Kept', stats.kept],
    ['accent-error', 'Errors', stats.errors],
    ['value', 'Delete rate', rate + '%'],
    ['value', 'FB / IG', stats.facebook + ' / ' + stats.instagram],
  ];
  document.getElementById('stats').innerHTML = cards.map(([cls, label, value]) =>
    '<div class="stat ' + (cls === 'value' ? '' : cls) + '"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>'
  ).join('');
}

function renderChart(events) {
  const buckets = 24;
  const now = Date.now();
  const hourMs = 3600 * 1000;
  const counts = Array.from({ length: buckets }, () => ({ deleted: 0, kept: 0 }));

  for (const e of events) {
    const age = now - new Date(e.timestamp).getTime();
    const bucket = buckets - 1 - Math.floor(age / hourMs);
    if (bucket < 0 || bucket >= buckets) continue;
    if (e.deleted) counts[bucket].deleted++;
    else if (e.verdict === 'KEEP') counts[bucket].kept++;
  }

  const maxCount = Math.max(1, ...counts.map((c) => c.deleted + c.kept));
  const width = 960, height = 90, gap = 3;
  const barW = (width / buckets) - gap;
  const svg = document.getElementById('chart');
  let out = '';

  counts.forEach((c, i) => {
    const x = i * (width / buckets) + gap / 2;
    const total = c.deleted + c.kept;
    const scale = (height - 4) / maxCount;
    const keptH = c.kept * scale;
    const delH = c.deleted * scale;
    const hoursAgo = buckets - 1 - i;
    const title = hoursAgo === 0 ? 'This hour' : hoursAgo + 'h ago';
    if (total === 0) {
      out += '<rect x="' + x + '" y="' + (height - 2) + '" width="' + barW + '" height="2" rx="1" fill="var(--border)"><title>' + title + ': no activity</title></rect>';
    } else {
      out += '<rect x="' + x + '" y="' + (height - keptH) + '" width="' + barW + '" height="' + Math.max(keptH, 1) + '" rx="1" fill="var(--keep)"><title>' + title + ': ' + c.kept + ' kept</title></rect>';
      out += '<rect x="' + x + '" y="' + (height - keptH - delH) + '" width="' + barW + '" height="' + Math.max(delH, delH > 0 ? 1 : 0) + '" rx="1" fill="var(--delete)"><title>' + title + ': ' + c.deleted + ' deleted</title></rect>';
    }
  });

  svg.innerHTML = out;
}

function deletedCell(e) {
  if (e.deleted) {
    return '<span class="deleted-yes">Yes' + (e.manual ? ' <span class="manual-tag">(manual)</span>' : '') + '</span>';
  }
  return '<button class="delete-btn" data-id="' + encodeURIComponent(e.commentId) + '" type="button">Delete</button>';
}

function applyFiltersAndRender() {
  const platform = document.getElementById('platformFilter').value;
  const verdict = document.getElementById('verdictFilter').value;
  const search = document.getElementById('search').value.trim().toLowerCase();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
  const toMs = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : null;

  const filtered = allEvents.filter((e) => {
    if (platform && e.platform !== platform) return false;
    if (verdict === 'ERROR' && !e.error) return false;
    if (verdict === 'DELETE' && e.verdict !== 'DELETE') return false;
    if (verdict === 'KEEP' && e.verdict !== 'KEEP') return false;
    if (search) {
      const hay = ((e.text || '') + ' ' + (e.author || '')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    const t = new Date(e.timestamp).getTime();
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  });

  document.getElementById('countHint').textContent = filtered.length + ' of ' + allEvents.length + ' shown';

  const rowsEl = document.getElementById('rows');
  const emptyEl = document.getElementById('empty');
  if (filtered.length === 0) {
    rowsEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    rowsEl.innerHTML = filtered.map((e) => {
      const badgeClass = e.error ? 'ERROR' : e.verdict;
      const badgeLabel = e.error ? 'ERROR' : e.verdict;
      return '<tr>' +
        '<td class="time" title="' + new Date(e.timestamp).toLocaleString() + '">' + relativeTime(e.timestamp) + '</td>' +
        '<td>' + platformBadge(e.platform) + '</td>' +
        '<td class="author">' + (e.author ? escapeHtml(e.author) : '<span class="muted">&mdash;</span>') + '</td>' +
        '<td class="text"><div class="full">' + escapeHtml(e.text || '') + '</div>' + (e.error ? '<div class="err">' + escapeHtml(e.error) + '</div>' : '') + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span>' + (e.autoBlocked ? '<span class="blocked-tag">BLOCKLISTED</span>' : '') + '</td>' +
        '<td>' + deletedCell(e) + '</td>' +
        '</tr>';
    }).join('');
  }
}

async function load() {
  const res = await fetch('api/events?limit=500');
  if (!res.ok) return;
  const { stats, events } = await res.json();
  allEvents = events;
  renderStats(stats);
  renderChart(events);
  applyFiltersAndRender();
  await loadBlocklist();
  document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

document.getElementById('platformFilter').addEventListener('change', applyFiltersAndRender);
document.getElementById('verdictFilter').addEventListener('change', applyFiltersAndRender);
document.getElementById('search').addEventListener('input', applyFiltersAndRender);
document.getElementById('refreshBtn').addEventListener('click', load);

function toLocalDateInput(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

document.getElementById('datePresets').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#datePresets button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  const days = parseInt(btn.dataset.days, 10);
  if (days === 0) {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
  } else {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400000);
    document.getElementById('dateFrom').value = toLocalDateInput(from);
    document.getElementById('dateTo').value = toLocalDateInput(to);
  }
  applyFiltersAndRender();
});

function clearPresetActive() {
  document.querySelectorAll('#datePresets button').forEach((b) => b.classList.remove('active'));
}
document.getElementById('dateFrom').addEventListener('change', () => { clearPresetActive(); applyFiltersAndRender(); });
document.getElementById('dateTo').addEventListener('change', () => { clearPresetActive(); applyFiltersAndRender(); });

document.getElementById('rows').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.delete-btn');
  if (!btn) return;
  const commentId = decodeURIComponent(btn.dataset.id);
  if (!confirm('Delete this comment? This cannot be undone.')) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    const res = await fetch('api/events/' + encodeURIComponent(commentId) + '/delete', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      alert('Failed to delete: ' + (data.error || 'unknown error'));
      btn.disabled = false;
      btn.textContent = 'Delete';
      return;
    }
    await load();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
});

load();
setInterval(load, 15000);
</script>
</body>
</html>`;

module.exports = router;
