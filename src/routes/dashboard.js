const express = require('express');
const { basicAuth } = require('../middleware/basicAuth');
const eventLog = require('../services/eventLog');

const router = express.Router();
router.use(basicAuth);

router.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
  res.json({ stats: eventLog.stats(), events: eventLog.list(limit) });
});

router.get('/dashboard', (_req, res) => {
  res.type('html').send(DASHBOARD_HTML);
});

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comment Moderation Dashboard</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #0f1115;
    --panel: #171a21;
    --border: #2a2e37;
    --text: #e6e8eb;
    --muted: #9098a4;
    --delete: #e5484d;
    --keep: #30a46c;
    --error: #f5a623;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 20px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 18px;
    min-width: 110px;
  }
  .stat .value { font-size: 24px; font-weight: 700; }
  .stat .label { font-size: 12px; color: var(--muted); margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th { color: var(--muted); font-weight: 500; font-size: 12px; }
  td.text { max-width: 480px; white-space: pre-wrap; word-break: break-word; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge.DELETE { background: rgba(229,72,77,0.15); color: var(--delete); }
  .badge.KEEP { background: rgba(48,166,108,0.15); color: var(--keep); }
  .badge.ERROR { background: rgba(245,166,35,0.15); color: var(--error); }
  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }
  #updated { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
</style>
</head>
<body>
  <h1>Comment Moderation Dashboard</h1>
  <div id="updated"></div>
  <div class="stats" id="stats"></div>
  <table>
    <thead>
      <tr><th>Time</th><th>Comment</th><th style="width:90px">Verdict</th><th style="width:70px">Deleted</th></tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="empty" id="empty" style="display:none">No comments processed yet.</div>

<script>
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function load() {
  const res = await fetch('api/events?limit=200');
  if (!res.ok) return;
  const { stats, events } = await res.json();

  document.getElementById('stats').innerHTML = [
    ['Total', stats.total],
    ['Deleted', stats.deleted],
    ['Kept', stats.kept],
    ['Errors', stats.errors],
  ].map(([label, value]) =>
    '<div class="stat"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>'
  ).join('');

  const rowsEl = document.getElementById('rows');
  const emptyEl = document.getElementById('empty');
  if (events.length === 0) {
    rowsEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    rowsEl.innerHTML = events.map((e) => {
      const badgeClass = e.error ? 'ERROR' : e.verdict;
      const badgeLabel = e.error ? 'ERROR' : e.verdict;
      return '<tr>' +
        '<td class="muted">' + fmtTime(e.timestamp) + '</td>' +
        '<td class="text">' + escapeHtml(e.text || '') + (e.error ? '<div class="muted">' + escapeHtml(e.error) + '</div>' : '') + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></td>' +
        '<td>' + (e.deleted ? 'yes' : 'no') + '</td>' +
        '</tr>';
    }).join('');
  }

  document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

load();
setInterval(load, 15000);
</script>
</body>
</html>`;

module.exports = router;
