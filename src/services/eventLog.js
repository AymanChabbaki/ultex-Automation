const db = require('../db');

function toEvent(row) {
  if (!row) return null;
  return {
    clientId: row.client_id,
    commentId: row.comment_id,
    text: row.text,
    verdict: row.verdict,
    deleted: row.deleted,
    error: row.error || undefined,
    platform: row.platform,
    author: row.author || undefined,
    authorId: row.author_id || undefined,
    autoBlocked: row.auto_blocked,
    manual: row.manual || undefined,
    timestamp: row.created_at,
  };
}

/**
 * Records one moderation decision for a given client.
 */
async function record(clientId, event) {
  await db.query(
    `INSERT INTO events (client_id, comment_id, text, verdict, deleted, error, platform, author, author_id, auto_blocked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      clientId,
      event.commentId,
      event.text ?? null,
      event.verdict ?? null,
      !!event.deleted,
      event.error ?? null,
      event.platform ?? null,
      event.author ?? null,
      event.authorId ?? null,
      !!event.autoBlocked,
    ]
  );
}

async function list(clientId, limit = 100) {
  const { rows } = await db.query(
    'SELECT * FROM events WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2',
    [clientId, limit]
  );
  return rows.map(toEvent);
}

async function getByCommentId(clientId, commentId) {
  const { rows } = await db.query(
    'SELECT * FROM events WHERE client_id = $1 AND comment_id = $2 ORDER BY created_at DESC LIMIT 1',
    [clientId, commentId]
  );
  return toEvent(rows[0]);
}

/**
 * Marks the most recent record for this comment as deleted, after a
 * manual action from the dashboard (used when the moderation model
 * missed something).
 */
async function markDeleted(clientId, commentId) {
  const { rows } = await db.query(
    `UPDATE events SET deleted = true, verdict = 'DELETE', manual = true, error = NULL
     WHERE id = (
       SELECT id FROM events WHERE client_id = $1 AND comment_id = $2
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING *`,
    [clientId, commentId]
  );
  return toEvent(rows[0]);
}

async function stats(clientId) {
  const { rows } = await db.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE deleted)::int AS deleted,
       count(*) FILTER (WHERE verdict = 'KEEP')::int AS kept,
       count(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
       count(*) FILTER (WHERE platform = 'facebook')::int AS facebook,
       count(*) FILTER (WHERE platform = 'instagram')::int AS instagram
     FROM events WHERE client_id = $1`,
    [clientId]
  );
  return rows[0] || { total: 0, deleted: 0, kept: 0, errors: 0, facebook: 0, instagram: 0 };
}

module.exports = { record, list, stats, getByCommentId, markDeleted };
