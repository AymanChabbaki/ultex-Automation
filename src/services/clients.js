const db = require('../db');

function toClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pageId: row.page_id,
    pageAccessToken: row.page_access_token,
    igUserId: row.ig_user_id,
    igAccessToken: row.ig_access_token,
    active: row.active,
    createdAt: row.created_at,
  };
}

async function list() {
  const { rows } = await db.query('SELECT * FROM clients ORDER BY name');
  return rows.map(toClient);
}

async function get(id) {
  const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
  return toClient(rows[0]);
}

async function getByPageId(pageId) {
  if (!pageId) return null;
  const { rows } = await db.query('SELECT * FROM clients WHERE page_id = $1', [pageId]);
  return toClient(rows[0]);
}

async function getByIgUserId(igUserId) {
  if (!igUserId) return null;
  const { rows } = await db.query('SELECT * FROM clients WHERE ig_user_id = $1', [igUserId]);
  return toClient(rows[0]);
}

async function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
  let id = base;
  let n = 2;
  while (await get(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

/**
 * Adds a new client. pageId/pageAccessToken are required (every client
 * moderates at least a Facebook Page); igUserId/igAccessToken are
 * optional, for clients who also want Instagram comments moderated.
 */
async function create({ name, pageId, pageAccessToken, igUserId, igAccessToken }) {
  if (!name || !pageId || !pageAccessToken) {
    throw new Error('name, pageId, and pageAccessToken are required');
  }
  if (await getByPageId(pageId)) {
    throw new Error(`A client already uses Page ID ${pageId}`);
  }
  if (igUserId && (await getByIgUserId(igUserId))) {
    throw new Error(`A client already uses Instagram account ID ${igUserId}`);
  }

  const id = await slugify(name);
  const { rows } = await db.query(
    `INSERT INTO clients (id, name, page_id, page_access_token, ig_user_id, ig_access_token)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, name, pageId, pageAccessToken, igUserId || null, igAccessToken || null]
  );
  return toClient(rows[0]);
}

const UPDATABLE_FIELDS = {
  name: 'name',
  pageId: 'page_id',
  pageAccessToken: 'page_access_token',
  igUserId: 'ig_user_id',
  igAccessToken: 'ig_access_token',
  active: 'active',
};

async function update(id, fields) {
  const existing = await get(id);
  if (!existing) return null;

  if (fields.pageId && fields.pageId !== existing.pageId && (await getByPageId(fields.pageId))) {
    throw new Error(`A client already uses Page ID ${fields.pageId}`);
  }
  if (fields.igUserId && fields.igUserId !== existing.igUserId && (await getByIgUserId(fields.igUserId))) {
    throw new Error(`A client already uses Instagram account ID ${fields.igUserId}`);
  }

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      values.push(fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return existing;

  values.push(id);
  const { rows } = await db.query(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return toClient(rows[0]);
}

async function remove(id) {
  const { rowCount } = await db.query('DELETE FROM clients WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, get, getByPageId, getByIgUserId, create, update, remove };
