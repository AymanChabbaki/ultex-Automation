const express = require('express');

const router = express.Router();

// Public, unauthenticated, and entirely self-contained -- no fetch()
// calls, no database, no real client involved. This exists purely to
// let a prospective client see and click around in the real dashboard
// UI on sample data, without having to hand over any Facebook/Instagram
// access first. Clicking "Delete"/"Unblock" mutates an in-memory array
// in the browser only.
router.get('/demo', (_req, res) => {
  res.type('html').send(DEMO_HTML);
});

const now = Date.now();
const minutesAgo = (m) => new Date(now - m * 60000).toISOString();

const SAMPLE_EVENTS = [
  { commentId: 'demo-1', timestamp: minutesAgo(4), platform: 'instagram', author: 'aymen_ddos777', text: 'nsaba', verdict: 'DELETE', deleted: true, autoBlocked: false },
  { commentId: 'demo-2', timestamp: minutesAgo(12), platform: 'facebook', author: 'Sara Idrissi', text: 'Bravo pour ce travail, service impeccable comme toujours! \u{1F44F}', verdict: 'KEEP', deleted: false },
  { commentId: 'demo-3', timestamp: minutesAgo(25), platform: 'instagram', author: 'karim_09', text: 'charika kidayra 3andkoum les prix?', verdict: 'KEEP', deleted: false },
  { commentId: 'demo-4', timestamp: minutesAgo(40), platform: 'facebook', author: 'random_promo22', text: 'idiots buy fake followers cheap link in bio DM me now', verdict: 'DELETE', deleted: true, autoBlocked: false },
  { commentId: 'demo-5', timestamp: minutesAgo(55), platform: 'facebook', author: 'Mehdi B.', text: "Je ne recommande pas du tout, service horrible et personne ne repond.", verdict: 'DELETE', deleted: true },
  { commentId: 'demo-6', timestamp: minutesAgo(70), platform: 'instagram', author: 'random_promo22', text: 'spam spam buy now cheap followers www.fake-link.com', verdict: 'DELETE', deleted: true, autoBlocked: true },
  { commentId: 'demo-7', timestamp: minutesAgo(95), platform: 'instagram', author: 'nour.ig', text: 'Machallah, superbe qualite ❤️', verdict: 'KEEP', deleted: false },
  { commentId: 'demo-8', timestamp: minutesAgo(130), platform: 'facebook', author: 'Anonymous', text: 'walo had chi, khasrtou lflouss', verdict: 'DELETE', deleted: false },
  { commentId: 'demo-9', timestamp: minutesAgo(200), platform: 'facebook', author: 'Youssef Alami', text: "Merci pour la reponse rapide, tres pro.", verdict: 'KEEP', deleted: false },
];

const SAMPLE_BLOCKED = [
  { platform: 'instagram', authorId: 'demo-author-1', authorName: 'random_promo22', blockedAt: minutesAgo(40) },
];

const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interactive Demo &ndash; Comment Moderation</title>
<script>
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
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--panel-2); border: 1px solid var(--border); color: var(--text);
    border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  .theme-toggle:hover { border-color: var(--accent); }

  .cta {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
    background: linear-gradient(135deg, rgba(91,141,239,0.15), rgba(214,92,201,0.1));
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 14px 18px;
    margin-bottom: 22px;
    font-size: 13px;
  }
  .cta strong { font-size: 14px; }
  .cta a.cta-btn {
    background: var(--accent); color: white; text-decoration: none;
    padding: 9px 16px; border-radius: 7px; font-weight: 600; font-size: 13px; white-space: nowrap;
  }

  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
  h1 { font-size: 19px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  h1 span.sub { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 10px; }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .live .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--keep); box-shadow: 0 0 0 0 rgba(52,184,116,0.5); animation: pulse 2s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(52,184,116,0.45); } 70% { box-shadow: 0 0 0 6px rgba(52,184,116,0); } 100% { box-shadow: 0 0 0 0 rgba(52,184,116,0); } }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
  .stat .value { font-size: 24px; font-weight: 700; line-height: 1.2; }
  .stat .label { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .stat.accent-delete .value { color: var(--delete); }
  .stat.accent-keep .value { color: var(--keep); }
  .stat.accent-error .value { color: var(--error); }

  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 20px; }
  .panel-title { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .toolbar select, .toolbar input {
    background: var(--panel-2); border: 1px solid var(--border); color: var(--text);
    border-radius: 7px; padding: 7px 10px; font-size: 13px; font-family: inherit;
  }
  .toolbar input[type="search"] { flex: 1; min-width: 160px; }
  .count-hint { color: var(--muted); font-size: 12px; margin-left: auto; }

  .delete-btn {
    background: transparent; border: 1px solid var(--delete); color: var(--delete);
    border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .delete-btn:hover { background: rgba(240,85,91,0.12); }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--panel-2); }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; background: var(--panel); }
  td.time { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.author { white-space: nowrap; color: var(--muted); }
  td.text { max-width: 420px; white-space: pre-wrap; word-break: break-word; }

  .platform-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .platform-badge.facebook { background: rgba(91,141,239,0.15); color: var(--fb); }
  .platform-badge.instagram { background: rgba(214,92,201,0.15); color: var(--ig); }
  .platform-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }
  .badge.DELETE { background: rgba(240,85,91,0.15); color: var(--delete); }
  .badge.KEEP { background: rgba(52,184,116,0.15); color: var(--keep); }

  .deleted-yes { color: var(--delete); font-weight: 600; }
  .blocked-tag { display: inline-block; margin-left: 6px; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; background: rgba(240,85,91,0.1); color: var(--delete); border: 1px solid rgba(240,85,91,0.3); }

  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 50px 0; text-align: center; font-size: 13px; }

  details.panel summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; }
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
    background: transparent; border: 1px solid var(--border); color: var(--muted);
    border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;
  }
  .unblock-btn:hover { border-color: var(--accent); color: var(--text); }
</style>
</head>
<body>
  <div class="cta">
    <div><strong>This is a live interactive demo</strong> &mdash; sample data, nothing connected. Click "Delete" or "Unblock" below, it's fully interactive.</div>
    <a class="cta-btn" href="mailto:hello@techermanos.org?subject=Comment%20moderation%20-%20get%20started">Get started with your Page &rarr;</a>
  </div>

  <header>
    <h1>Sample Business<span class="sub">Comment Moderation &middot; Facebook &amp; Instagram</span></h1>
    <div style="display:flex; align-items:center; gap:14px;">
      <span class="live"><span class="dot"></span><span>Demo data</span></span>
      <button class="theme-toggle" id="themeToggle" type="button"><span id="themeIcon">&#9728;</span> <span id="themeLabel">Light</span></button>
    </div>
  </header>

  <div class="stats" id="stats"></div>

  <details class="panel" id="blocklistPanel" open>
    <summary>
      <span class="panel-title">Blocked authors (<span id="blockedCount">0</span>)</span>
      <span class="chev">&#9656;</span>
    </summary>
    <table class="blocklist-table">
      <thead><tr><th>Platform</th><th>Author</th><th>Blocked</th><th style="width:80px"></th></tr></thead>
      <tbody id="blocklistRows"></tbody>
    </table>
    <div class="empty" id="blocklistEmpty" style="display:none; padding: 16px 0;">No blocked authors.</div>
  </details>

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
    </select>
    <input type="search" id="search" placeholder="Search comment text or author&hellip;">
    <span class="count-hint" id="countHint"></span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:110px">Time</th>
          <th style="width:110px">Platform</th>
          <th style="width:140px">Author</th>
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
let allEvents = ${JSON.stringify(SAMPLE_EVENTS)};
let allBlocked = ${JSON.stringify(SAMPLE_BLOCKED)};

function applyThemeUi() {
  const theme = document.documentElement.getAttribute('data-theme');
  document.getElementById('themeIcon').innerHTML = theme === 'light' ? '&#9728;' : '&#9789;';
  document.getElementById('themeLabel').textContent = theme === 'light' ? 'Light' : 'Dark';
}
applyThemeUi();
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('moderation-theme', next);
  applyThemeUi();
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function relativeTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  return h + 'h ago';
}
function platformBadge(p) {
  if (p === 'instagram') return '<span class="platform-badge instagram"><span class="dot"></span>Instagram</span>';
  return '<span class="platform-badge facebook"><span class="dot"></span>Facebook</span>';
}

function renderStats() {
  const total = allEvents.length;
  const deleted = allEvents.filter((e) => e.deleted).length;
  const kept = allEvents.filter((e) => e.verdict === 'KEEP').length;
  const rate = total ? Math.round((deleted / total) * 100) : 0;
  const fb = allEvents.filter((e) => e.platform === 'facebook').length;
  const ig = allEvents.filter((e) => e.platform === 'instagram').length;
  const cards = [
    ['', 'Total', total], ['accent-delete', 'Deleted', deleted], ['accent-keep', 'Kept', kept],
    ['', 'Delete rate', rate + '%'], ['', 'FB / IG', fb + ' / ' + ig],
  ];
  document.getElementById('stats').innerHTML = cards.map(([cls, label, value]) =>
    '<div class="stat ' + cls + '"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>'
  ).join('');
}

function renderBlocklist() {
  document.getElementById('blockedCount').textContent = allBlocked.length;
  const rowsEl = document.getElementById('blocklistRows');
  const emptyEl = document.getElementById('blocklistEmpty');
  if (allBlocked.length === 0) {
    rowsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  rowsEl.innerHTML = allBlocked.map((b) =>
    '<tr>' +
      '<td>' + platformBadge(b.platform) + '</td>' +
      '<td>' + escapeHtml(b.authorName) + '</td>' +
      '<td class="muted">' + relativeTime(b.blockedAt) + '</td>' +
      '<td><button class="unblock-btn" data-author-id="' + escapeHtml(b.authorId) + '" type="button">Unblock</button></td>' +
    '</tr>'
  ).join('');
}
document.getElementById('blocklistRows').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.unblock-btn');
  if (!btn) return;
  allBlocked = allBlocked.filter((b) => b.authorId !== btn.dataset.authorId);
  renderBlocklist();
});

function deletedCell(e) {
  if (e.deleted) return '<span class="deleted-yes">Yes</span>';
  return '<button class="delete-btn" data-id="' + e.commentId + '" type="button">Delete</button>';
}

function render() {
  const platform = document.getElementById('platformFilter').value;
  const verdict = document.getElementById('verdictFilter').value;
  const search = document.getElementById('search').value.trim().toLowerCase();

  const filtered = allEvents.filter((e) => {
    if (platform && e.platform !== platform) return false;
    if (verdict === 'DELETE' && e.verdict !== 'DELETE') return false;
    if (verdict === 'KEEP' && e.verdict !== 'KEEP') return false;
    if (search && !((e.text + ' ' + e.author).toLowerCase().includes(search))) return false;
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
    rowsEl.innerHTML = filtered.map((e) =>
      '<tr>' +
        '<td class="time">' + relativeTime(e.timestamp) + '</td>' +
        '<td>' + platformBadge(e.platform) + '</td>' +
        '<td class="author">' + escapeHtml(e.author) + '</td>' +
        '<td class="text">' + escapeHtml(e.text) + '</td>' +
        '<td><span class="badge ' + e.verdict + '">' + e.verdict + '</span>' + (e.autoBlocked ? '<span class="blocked-tag">BLOCKLISTED</span>' : '') + '</td>' +
        '<td>' + deletedCell(e) + '</td>' +
      '</tr>'
    ).join('');
  }
  renderStats();
}

document.getElementById('platformFilter').addEventListener('change', render);
document.getElementById('verdictFilter').addEventListener('change', render);
document.getElementById('search').addEventListener('input', render);

document.getElementById('rows').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.delete-btn');
  if (!btn) return;
  const e = allEvents.find((ev2) => ev2.commentId === btn.dataset.id);
  if (!e) return;
  e.deleted = true;
  e.verdict = 'DELETE';
  render();
});

render();
renderBlocklist();
</script>
</body>
</html>`;

module.exports = router;
