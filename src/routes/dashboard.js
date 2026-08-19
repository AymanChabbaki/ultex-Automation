const express = require('express');
const { basicAuth } = require('../middleware/basicAuth');
const eventLog = require('../services/eventLog');
const blocklist = require('../services/blocklist');
const { deleteComment } = require('../services/facebook');

const router = express.Router();
router.use(basicAuth);

router.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  res.json({ stats: eventLog.stats(), events: eventLog.list(limit) });
});

// Manual delete, for when the moderation model missed a comment it
// should have flagged. Same Graph API call the automatic path uses,
// triggered by a human from the dashboard instead of a webhook event.
// Also blocklists the author, same as an AI-caught delete, so a human
// catching what the model missed still prevents their next comment.
router.post('/api/events/:commentId/delete', async (req, res) => {
  const { commentId } = req.params;
  const entry = eventLog.getByCommentId(commentId);

  if (!entry) {
    return res.status(404).json({ success: false, error: 'Unknown comment ID' });
  }
  if (entry.deleted) {
    return res.json({ success: true, event: entry });
  }

  const result = await deleteComment(commentId, entry.platform);
  if (!result.ok) {
    return res.status(502).json({ success: false, error: result.error });
  }

  const updated = eventLog.markDeleted(commentId);
  if (entry.authorId) {
    blocklist.block(entry.platform, entry.authorId, entry.author, commentId);
  }
  res.json({ success: true, event: updated });
});

router.get('/api/blocklist', (_req, res) => {
  res.json({ blocked: blocklist.list() });
});

router.post('/api/blocklist/unblock', (req, res) => {
  const { platform, authorId } = req.body || {};
  if (!platform || !authorId) {
    return res.status(400).json({ success: false, error: 'platform and authorId are required' });
  }
  const existed = blocklist.unblock(platform, authorId);
  res.json({ success: existed });
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
    color-scheme: light;
    --bg: #f5f6f8;
    --surface: #ffffff;
    --surface-2: #f9fafb;
    --border: #e5e7eb;
    --text: #1a1d23;
    --muted: #6b7280;
    --muted-2: #9ca3af;
    --accent: #4f6bed;
    --accent-soft: rgba(79,107,237,0.1);
    --delete: #e5484d;
    --delete-soft: rgba(229,72,77,0.1);
    --keep: #12b76a;
    --keep-soft: rgba(18,183,106,0.1);
    --error: #f59e0b;
    --error-soft: rgba(245,158,11,0.12);
    --fb: #1877f2;
    --ig: #d6249f;
    --radius: 12px;
    --shadow: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  .app { display: flex; min-height: 100vh; align-items: stretch; }

  /* Sidebar */
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 20px 14px;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 24px; }
  .brand-mark {
    width: 34px; height: 34px; border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), #8b9cf1);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; letter-spacing: -0.02em; flex-shrink: 0;
  }
  .brand-name { font-weight: 650; font-size: 14px; line-height: 1.3; }
  .brand-sub { font-size: 11px; color: var(--muted); }

  .nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .nav-link {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 8px;
    color: var(--muted); text-decoration: none;
    font-size: 13.5px; font-weight: 500;
  }
  .nav-link svg { width: 17px; height: 17px; flex-shrink: 0; }
  .nav-link:hover { background: var(--surface-2); color: var(--text); }
  .nav-link.active { background: var(--accent-soft); color: var(--accent); }
  .nav-badge {
    margin-left: auto; background: var(--delete-soft); color: var(--delete);
    font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px;
  }

  .sidebar-footer {
    border-top: 1px solid var(--border);
    padding-top: 14px; margin-top: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); padding: 0 8px; }
  .live .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--keep);
    box-shadow: 0 0 0 0 rgba(18,183,106,0.5);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(18,183,106,0.45); }
    70% { box-shadow: 0 0 0 6px rgba(18,183,106,0); }
    100% { box-shadow: 0 0 0 0 rgba(18,183,106,0); }
  }
  #refreshBtn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    width: 100%;
  }
  #refreshBtn:hover { border-color: var(--accent); color: var(--accent); }

  /* Content */
  .content { flex: 1; min-width: 0; padding: 28px 34px 60px; max-width: 1320px; }
  .page-header { margin-bottom: 22px; }
  .page-header h1 { margin: 0 0 4px; font-size: 21px; font-weight: 650; letter-spacing: -0.01em; }
  .page-header p { margin: 0; color: var(--muted); font-size: 13px; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px 20px;
    margin-bottom: 16px;
  }
  .card-title {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 650;
    margin-bottom: 14px;
  }
  .card-title .hint { text-transform: none; font-weight: 400; letter-spacing: 0; float: right; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 15px 17px;
  }
  .stat .value { font-size: 24px; font-weight: 700; line-height: 1.2; }
  .stat .label { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .stat.accent-delete .value { color: var(--delete); }
  .stat.accent-keep .value { color: var(--keep); }
  .stat.accent-error .value { color: var(--error); }

  .grid-2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; align-items: stretch; }
  .grid-2 .card { margin-bottom: 0; }

  #chart { width: 100%; height: 110px; display: block; overflow: visible; }
  #chart rect { transition: opacity 0.1s; }
  #chart rect:hover { opacity: 0.75; }
  .chart-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: var(--muted); }
  .chart-legend .sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }

  .donut-wrap { position: relative; width: 148px; height: 148px; margin: 4px auto 0; }
  .donut-wrap svg { width: 100%; height: 100%; }
  .donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .donut-center .num { font-size: 22px; font-weight: 700; line-height: 1; }
  .donut-center .lbl { font-size: 11px; color: var(--muted); margin-top: 3px; }

  .legend-list { display: flex; flex-direction: column; gap: 9px; margin-top: 16px; font-size: 12.5px; }
  .legend-list .row { display: flex; align-items: center; }
  .legend-list .sw { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-right: 8px; flex-shrink: 0; }
  .legend-list .row .lbl { color: var(--muted); }
  .legend-list .row .val { margin-left: auto; font-weight: 650; }

  .platform-bar-track {
    display: flex; height: 10px; border-radius: 999px; overflow: hidden;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .platform-bar-track .fb { background: var(--fb); }
  .platform-bar-track .ig { background: var(--ig); }
  .platform-stats { display: flex; justify-content: space-between; margin-top: 14px; }
  .platform-stat { text-align: left; }
  .platform-stat .num { font-size: 19px; font-weight: 700; }
  .platform-stat .lbl { font-size: 11.5px; color: var(--muted); margin-top: 2px; display: flex; align-items: center; gap: 5px; }
  .platform-stat .lbl .sw { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .platform-stat.ig-stat { text-align: right; }
  .platform-stat.ig-stat .lbl { justify-content: flex-end; }

  .mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .mini-table th, .mini-table td { text-align: left; padding: 8px 8px; border-bottom: 1px solid var(--border); }
  .mini-table tbody tr:last-child td { border-bottom: none; }
  .mini-table th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .mini-table td.text { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .view-all { display: inline-block; margin-top: 12px; font-size: 12.5px; color: var(--accent); text-decoration: none; font-weight: 600; }
  .view-all:hover { text-decoration: underline; }

  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
  .toolbar select, .toolbar input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
  }
  .toolbar input[type="search"] { flex: 1; min-width: 160px; }
  .toolbar button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .toolbar button:hover { border-color: var(--accent); color: var(--accent); }
  .count-hint { color: var(--muted); font-size: 12px; margin-left: auto; }

  .presets { display: flex; gap: 4px; }
  .presets button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 8px;
    padding: 7px 11px;
    font-size: 12px;
    cursor: pointer;
  }
  .presets button:hover { border-color: var(--accent); color: var(--accent); }
  .presets button.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
  .date-sep { color: var(--muted); font-size: 12px; }

  .delete-btn {
    background: var(--surface);
    border: 1px solid var(--delete);
    color: var(--delete);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .delete-btn:hover { background: var(--delete-soft); }
  .delete-btn:disabled { opacity: 0.5; cursor: default; }
  .manual-tag { color: var(--muted); font-size: 11px; font-weight: 400; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 760px; }
  th, td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--surface-2); }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; background: var(--surface-2); }
  td.time { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.author { white-space: nowrap; color: var(--muted); }
  td.text { max-width: 420px; }
  td.text .full { white-space: pre-wrap; word-break: break-word; }
  td.text .err { color: var(--error); font-size: 12px; margin-top: 4px; }
  td.post a { color: var(--accent); text-decoration: none; font-size: 12px; white-space: nowrap; font-weight: 600; }
  td.post a:hover { text-decoration: underline; }

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
  .platform-badge.facebook { background: rgba(24,119,242,0.1); color: var(--fb); }
  .platform-badge.instagram { background: rgba(214,36,159,0.1); color: var(--ig); }
  .platform-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .badge {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .badge.DELETE { background: var(--delete-soft); color: var(--delete); }
  .badge.KEEP { background: var(--keep-soft); color: var(--keep); }
  .badge.ERROR { background: var(--error-soft); color: #b45309; }

  .deleted-yes { color: var(--delete); font-weight: 600; }
  .deleted-no { color: var(--muted); }
  .blocked-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    background: var(--delete-soft);
    color: var(--delete);
    border: 1px solid rgba(229,72,77,0.25);
  }

  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 50px 0; text-align: center; font-size: 13px; }

  .blocklist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .blocklist-table td, .blocklist-table th { padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: left; }
  .blocklist-table th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; background: var(--surface-2); }
  .blocklist-table tr:last-child td { border-bottom: none; }
  .unblock-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .unblock-btn:hover { border-color: var(--accent); color: var(--accent); }

  .page[hidden] { display: none; }

  @media (max-width: 900px) {
    .app { flex-direction: column; }
    .sidebar { width: 100%; height: auto; position: relative; flex-direction: row; align-items: center; padding: 12px 16px; }
    .brand { padding: 0; margin-right: 16px; }
    .nav { flex-direction: row; }
    .sidebar-footer { display: none; }
    .content { padding: 20px; }
    .grid-2 { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">CM</div>
        <div>
          <div class="brand-name">Moderation</div>
          <div class="brand-sub">Facebook &amp; Instagram</div>
        </div>
      </div>
      <nav class="nav">
        <a href="#dashboard" class="nav-link" data-page="dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg>
          Dashboard
        </a>
        <a href="#comments" class="nav-link" data-page="comments">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          Comments
        </a>
        <a href="#blocklist" class="nav-link" data-page="blocklist">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"></line></svg>
          Blocklist
          <span class="nav-badge" id="navBlockedCount" style="display:none">0</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <span class="live"><span class="dot"></span><span id="updated">Loading&hellip;</span></span>
        <button id="refreshBtn" type="button">Refresh</button>
      </div>
    </aside>

    <main class="content">
      <section class="page" id="page-dashboard">
        <div class="page-header">
          <h1>Dashboard</h1>
          <p>Overview of comment moderation activity</p>
        </div>

        <div class="stats" id="stats"></div>

        <div class="grid-2" style="margin-bottom:16px">
          <div class="card">
            <div class="card-title">Activity, last 24h</div>
            <svg id="chart" viewBox="0 0 960 110" preserveAspectRatio="none"></svg>
            <div class="chart-legend">
              <span><span class="sw" style="background:var(--delete)"></span>Deleted</span>
              <span><span class="sw" style="background:var(--keep)"></span>Kept</span>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Verdict breakdown</div>
            <div class="donut-wrap">
              <svg id="verdictDonut" viewBox="0 0 148 148"></svg>
              <div class="donut-center"><div class="num" id="donutTotal">0</div><div class="lbl">total</div></div>
            </div>
            <div class="legend-list" id="verdictLegend"></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title">Recent activity <a href="#comments" class="view-all" style="float:right; margin-top:-2px">View all &rarr;</a></div>
            <table class="mini-table">
              <thead><tr><th>Time</th><th>Platform</th><th>Author</th><th>Comment</th><th>Verdict</th></tr></thead>
              <tbody id="recentRows"></tbody>
            </table>
          </div>
          <div class="card">
            <div class="card-title">Platform split</div>
            <div class="platform-bar-track" id="platformBar"><div class="fb" id="platformBarFb"></div><div class="ig" id="platformBarIg"></div></div>
            <div class="platform-stats">
              <div class="platform-stat">
                <div class="num" id="fbCount">0</div>
                <div class="lbl"><span class="sw" style="background:var(--fb)"></span>Facebook</div>
              </div>
              <div class="platform-stat ig-stat">
                <div class="num" id="igCount">0</div>
                <div class="lbl"><span class="sw" style="background:var(--ig)"></span>Instagram<span></span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="page" id="page-comments" hidden>
        <div class="page-header">
          <h1>Comments</h1>
          <p>Every moderation decision, with filters and manual override</p>
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
                <th style="width:60px">Post</th>
                <th style="width:90px">Verdict</th>
                <th style="width:110px">Deleted</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
        <div class="empty" id="empty" style="display:none">No comments match the current filters.</div>
      </section>

      <section class="page" id="page-blocklist" hidden>
        <div class="page-header">
          <h1>Blocklist</h1>
          <p>Authors whose comments are removed on sight, no re-check</p>
        </div>

        <div class="card">
          <table class="blocklist-table">
            <thead>
              <tr><th>Platform</th><th>Author</th><th>Blocked</th><th style="width:80px"></th></tr>
            </thead>
            <tbody id="blocklistRows"></tbody>
          </table>
          <div class="empty" id="blocklistEmpty" style="display:none; padding: 16px 0;">No blocked authors yet -- they're added automatically the first time one of their comments is deleted.</div>
        </div>
      </section>
    </main>
  </div>

<script>
let allEvents = [];

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

/* ---------- routing ---------- */
const PAGES = ['dashboard', 'comments', 'blocklist'];
function navigate(page) {
  if (!PAGES.includes(page)) page = 'dashboard';
  PAGES.forEach((p) => {
    document.getElementById('page-' + p).hidden = p !== page;
  });
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
document.querySelector('.nav').addEventListener('click', (ev) => {
  const link = ev.target.closest('.nav-link');
  if (link) navigate(link.dataset.page);
});

/* ---------- blocklist ---------- */
async function loadBlocklist() {
  const res = await fetch('api/blocklist');
  if (!res.ok) return;
  const { blocked } = await res.json();

  const navBadge = document.getElementById('navBlockedCount');
  if (blocked.length > 0) {
    navBadge.style.display = '';
    navBadge.textContent = blocked.length;
  } else {
    navBadge.style.display = 'none';
  }

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

/* ---------- stats + charts ---------- */
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
  const width = 960, height = 110, gap = 3;
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

function renderDonut(stats) {
  const segments = [
    { label: 'Deleted', value: stats.deleted, color: 'var(--delete)', hex: '#e5484d' },
    { label: 'Kept', value: stats.kept, color: 'var(--keep)', hex: '#12b76a' },
    { label: 'Errors', value: stats.errors, color: 'var(--error)', hex: '#f59e0b' },
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);
  document.getElementById('donutTotal').textContent = total;

  const size = 148, thickness = 20;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const svg = document.getElementById('verdictDonut');

  if (total === 0) {
    svg.innerHTML = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e5e7eb" stroke-width="' + thickness + '"></circle>';
  } else {
    let offset = 0;
    let out = '';
    segments.filter((s) => s.value > 0).forEach((seg) => {
      const frac = seg.value / total;
      const dash = frac * circ;
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.hex + '" stroke-width="' + thickness +
        '" stroke-dasharray="' + dash + ' ' + (circ - dash) + '" stroke-dashoffset="' + (-offset) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + seg.label + ': ' + seg.value + '</title></circle>';
      offset += dash;
    });
    svg.innerHTML = out;
  }

  document.getElementById('verdictLegend').innerHTML = segments.map((s) =>
    '<div class="row"><span class="sw" style="background:' + s.hex + '"></span><span class="lbl">' + s.label + '</span><span class="val">' + s.value + '</span></div>'
  ).join('');
}

function renderPlatformSplit(stats) {
  const total = stats.facebook + stats.instagram;
  const fbPct = total ? (stats.facebook / total) * 100 : 50;
  const igPct = total ? (stats.instagram / total) * 100 : 50;
  document.getElementById('platformBarFb').style.width = fbPct + '%';
  document.getElementById('platformBarIg').style.width = igPct + '%';
  document.getElementById('fbCount').textContent = stats.facebook;
  document.getElementById('igCount').textContent = stats.instagram;
}

function renderRecent(events) {
  const recent = events.slice(0, 6);
  const rowsEl = document.getElementById('recentRows');
  if (recent.length === 0) {
    rowsEl.innerHTML = '<tr><td colspan="5" class="muted" style="padding:16px 8px">No activity yet.</td></tr>';
    return;
  }
  rowsEl.innerHTML = recent.map((e) => {
    const badgeClass = e.error ? 'ERROR' : e.verdict;
    const badgeLabel = e.error ? 'ERROR' : e.verdict;
    return '<tr>' +
      '<td class="muted" style="white-space:nowrap">' + relativeTime(e.timestamp) + '</td>' +
      '<td>' + platformBadge(e.platform) + '</td>' +
      '<td class="muted" style="white-space:nowrap">' + (e.author ? escapeHtml(e.author) : '&mdash;') + '</td>' +
      '<td class="text">' + escapeHtml(e.text || '') + '</td>' +
      '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></td>' +
      '</tr>';
  }).join('');
}

/* ---------- comments table ---------- */
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
        '<td class="post">' + (e.postLink ? '<a href="' + escapeHtml(e.postLink) + '" target="_blank" rel="noopener noreferrer">View</a>' : '<span class="muted">&mdash;</span>') + '</td>' +
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
  renderDonut(stats);
  renderPlatformSplit(stats);
  renderRecent(events);
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

navigate(location.hash.slice(1) || 'dashboard');
load();
setInterval(load, 15000);
</script>
</body>
</html>`;

module.exports = router;
