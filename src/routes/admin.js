const express = require('express');
const { basicAuth } = require('../middleware/basicAuth');
const clients = require('../services/clients');

const router = express.Router();
router.use(basicAuth);

router.get('/admin/api/clients', async (_req, res) => {
  // Never send raw tokens back to the browser -- the admin screen only
  // needs to know a token is set, not its value, once it's been saved.
  const list = await clients.list();
  const safe = list.map(({ pageAccessToken, igAccessToken, ...rest }) => ({
    ...rest,
    hasPageToken: !!pageAccessToken,
    hasIgToken: !!igAccessToken,
  }));
  res.json({ clients: safe });
});

router.post('/admin/api/clients', async (req, res) => {
  try {
    const client = await clients.create(req.body || {});
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/admin/api/clients/:id', async (req, res) => {
  try {
    const client = await clients.update(req.params.id, req.body || {});
    if (!client) return res.status(404).json({ success: false, error: 'Unknown client' });
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/admin/api/clients/:id', async (req, res) => {
  const existed = await clients.remove(req.params.id);
  res.json({ success: existed });
});

router.get('/admin', (_req, res) => {
  res.type('html').send(ADMIN_HTML);
});

const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Client Admin</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #0b0d12;
    --panel: #151822;
    --panel-2: #1b1f2b;
    --border: #262b38;
    --text: #eceef2;
    --muted: #8b93a3;
    --accent: #5b8def;
    --danger: #f0555b;
    --ok: #34b874;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 28px 32px 60px;
  }
  h1 { font-size: 19px; font-weight: 650; margin: 0 0 20px; letter-spacing: -0.01em; }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    margin-bottom: 20px;
  }
  .panel-title { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 14px; }
  form.add-client { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
  form.add-client label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  form.add-client input {
    width: 100%;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 7px;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
  }
  form.add-client .full { grid-column: 1 / -1; }
  form.add-client .actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
  button {
    background: var(--accent);
    border: none;
    color: white;
    border-radius: 7px;
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  button.secondary { background: var(--panel-2); border: 1px solid var(--border); color: var(--text); }
  button.danger { background: transparent; border: 1px solid var(--danger); color: var(--danger); }
  button:disabled { opacity: 0.5; cursor: default; }
  .form-msg { font-size: 13px; }
  .form-msg.error { color: var(--danger); }
  .form-msg.ok { color: var(--ok); }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .muted { color: var(--muted); }
  .ids { font-size: 12px; color: var(--muted); }
  .status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .status.active { background: rgba(52,184,116,0.15); color: var(--ok); }
  .status.inactive { background: rgba(240,85,91,0.15); color: var(--danger); }
  .row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .row-actions button { padding: 5px 10px; font-size: 11px; }
  a.dash-link { color: var(--accent); text-decoration: none; font-size: 12px; }
  a.dash-link:hover { text-decoration: underline; }
  .empty { color: var(--muted); padding: 30px 0; text-align: center; }
</style>
</head>
<body>
  <h1>Client Admin</h1>

  <div class="panel">
    <div class="panel-title">Add a client</div>
    <form class="add-client" id="addForm">
      <div>
        <label for="name">Client name</label>
        <input id="name" name="name" required placeholder="e.g. ULTEx">
      </div>
      <div>
        <label for="pageId">Facebook Page ID</label>
        <input id="pageId" name="pageId" required placeholder="106480395512492">
      </div>
      <div class="full">
        <label for="pageAccessToken">Page Access Token</label>
        <input id="pageAccessToken" name="pageAccessToken" required placeholder="EAAW...">
      </div>
      <div>
        <label for="igUserId">Instagram Account ID (optional)</label>
        <input id="igUserId" name="igUserId" placeholder="17841454947560776">
      </div>
      <div>
        <label for="igAccessToken">Instagram Access Token (optional)</label>
        <input id="igAccessToken" name="igAccessToken" placeholder="IGAA...">
      </div>
      <div class="actions">
        <button type="submit">Add client</button>
        <span class="form-msg" id="formMsg"></span>
      </div>
    </form>
  </div>

  <div class="panel">
    <div class="panel-title">Clients</div>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>IDs</th>
          <th>Tokens</th>
          <th>Status</th>
          <th>Dashboard</th>
          <th style="width:160px"></th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="empty" id="empty" style="display:none">No clients yet -- add one above.</div>
  </div>

<script>
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function loadClients() {
  const res = await fetch('admin/api/clients');
  const { clients } = await res.json();
  const rowsEl = document.getElementById('rows');
  const emptyEl = document.getElementById('empty');

  if (clients.length === 0) {
    rowsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  rowsEl.innerHTML = clients.map((c) => {
    const tokens = (c.hasPageToken ? 'FB' : '') + (c.hasIgToken ? (c.hasPageToken ? ' + IG' : 'IG') : '');
    return '<tr>' +
      '<td>' + escapeHtml(c.name) + '<div class="ids">' + escapeHtml(c.id) + '</div></td>' +
      '<td class="ids">Page: ' + escapeHtml(c.pageId) + (c.igUserId ? '<br>IG: ' + escapeHtml(c.igUserId) : '') + '</td>' +
      '<td class="muted">' + (tokens || 'none') + '</td>' +
      '<td><span class="status ' + (c.active ? 'active' : 'inactive') + '">' + (c.active ? 'Active' : 'Paused') + '</span></td>' +
      '<td><a class="dash-link" href="clients/' + encodeURIComponent(c.id) + '/dashboard" target="_blank">Open &rarr;</a></td>' +
      '<td class="row-actions">' +
        '<button class="secondary" data-action="toggle" data-id="' + escapeHtml(c.id) + '" data-active="' + c.active + '" type="button">' + (c.active ? 'Pause' : 'Resume') + '</button>' +
        '<button class="danger" data-action="delete" data-id="' + escapeHtml(c.id) + '" type="button">Delete</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

document.getElementById('addForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msgEl = document.getElementById('formMsg');
  msgEl.textContent = '';
  msgEl.className = 'form-msg';

  const form = ev.target;
  const body = {
    name: form.name.value.trim(),
    pageId: form.pageId.value.trim(),
    pageAccessToken: form.pageAccessToken.value.trim(),
    igUserId: form.igUserId.value.trim() || undefined,
    igAccessToken: form.igAccessToken.value.trim() || undefined,
  };

  try {
    const res = await fetch('admin/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) {
      msgEl.textContent = data.error;
      msgEl.classList.add('error');
      return;
    }
    msgEl.textContent = 'Added ' + data.client.name;
    msgEl.classList.add('ok');
    form.reset();
    await loadClients();
  } catch (err) {
    msgEl.textContent = 'Failed: ' + err.message;
    msgEl.classList.add('error');
  }
});

document.getElementById('rows').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.action === 'toggle') {
    const nextActive = btn.dataset.active !== 'true';
    btn.disabled = true;
    await fetch('admin/api/clients/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextActive }),
    });
    await loadClients();
  }

  if (btn.dataset.action === 'delete') {
    if (!confirm('Delete this client? Their moderation history stays in the log, but they will stop being moderated.')) return;
    btn.disabled = true;
    await fetch('admin/api/clients/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadClients();
  }
});

loadClients();
</script>
</body>
</html>`;

module.exports = router;
