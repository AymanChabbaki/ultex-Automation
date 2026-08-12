const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'clients.json');

// A "client" is one onboarded business: their Page/IG credentials and
// which IDs route incoming webhook events to them. Kept as a simple
// JSON file + in-memory maps, same pattern as blocklist.js/eventLog.js
// -- fine at the scale of tens/low-hundreds of clients this is meant
// for; move to a real DB first if that stops being true.
let clients = [];
let byId = new Map();
let byPageId = new Map();
let byIgUserId = new Map();

function reindex() {
  byId = new Map(clients.map((c) => [c.id, c]));
  byPageId = new Map(clients.filter((c) => c.pageId).map((c) => [c.pageId, c]));
  byIgUserId = new Map(clients.filter((c) => c.igUserId).map((c) => [c.igUserId, c]));
}

function loadFromDisk() {
  if (!fs.existsSync(FILE)) return;
  try {
    clients = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    clients = [];
  }
  reindex();
}
loadFromDisk();

function persist() {
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(FILE, JSON.stringify(clients, null, 2), () => {});
  });
}

function list() {
  return [...clients].sort((a, b) => a.name.localeCompare(b.name));
}

function get(id) {
  return byId.get(id) || null;
}

function getByPageId(pageId) {
  return byPageId.get(pageId) || null;
}

function getByIgUserId(igUserId) {
  return byIgUserId.get(igUserId) || null;
}

function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  let id = base;
  let n = 2;
  while (byId.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

/**
 * Adds a new client. pageId/pageAccessToken are required (every client
 * moderates at least a Facebook Page); igUserId/igAccessToken are
 * optional, for clients who also want Instagram comments moderated.
 */
function create({ name, pageId, pageAccessToken, igUserId, igAccessToken }) {
  if (!name || !pageId || !pageAccessToken) {
    throw new Error('name, pageId, and pageAccessToken are required');
  }
  if (getByPageId(pageId)) {
    throw new Error(`A client already uses Page ID ${pageId}`);
  }
  if (igUserId && getByIgUserId(igUserId)) {
    throw new Error(`A client already uses Instagram account ID ${igUserId}`);
  }

  const client = {
    id: slugify(name),
    name,
    pageId,
    pageAccessToken,
    igUserId: igUserId || null,
    igAccessToken: igAccessToken || null,
    active: true,
    createdAt: new Date().toISOString(),
  };
  clients.push(client);
  reindex();
  persist();
  return client;
}

function update(id, fields) {
  const client = byId.get(id);
  if (!client) return null;

  if (fields.pageId && fields.pageId !== client.pageId && getByPageId(fields.pageId)) {
    throw new Error(`A client already uses Page ID ${fields.pageId}`);
  }
  if (fields.igUserId && fields.igUserId !== client.igUserId && getByIgUserId(fields.igUserId)) {
    throw new Error(`A client already uses Instagram account ID ${fields.igUserId}`);
  }

  Object.assign(client, fields);
  reindex();
  persist();
  return client;
}

function remove(id) {
  const before = clients.length;
  clients = clients.filter((c) => c.id !== id);
  reindex();
  if (clients.length !== before) persist();
  return clients.length !== before;
}

module.exports = { list, get, getByPageId, getByIgUserId, create, update, remove };
