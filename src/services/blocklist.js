const db = require('../db');

function toBlocked(row) {
  if (!row) return null;
  return {
    clientId: row.client_id,
    platform: row.platform,
    authorId: row.author_id,
    authorName: row.author_name || null,
    reason: row.reason || null,
    blockedAt: row.blocked_at,
  };
}

async function isBlocked(clientId, platform, authorId) {
  if (!authorId) return false;
  const { rows } = await db.query(
    'SELECT 1 FROM blocklist WHERE client_id = $1 AND platform = $2 AND author_id = $3',
    [clientId, platform, authorId]
  );
  return rows.length > 0;
}

/**
 * Blocks an author after a comment of theirs was deleted (automatically
 * or manually). Future comments from them skip moderation entirely and
 * are deleted on sight. Re-blocking just refreshes the reason/comment
 * reference rather than erroring.
 */
async function block(clientId, platform, authorId, authorName, reason) {
  if (!authorId) return;
  await db.query(
    `INSERT INTO blocklist (client_id, platform, author_id, author_name, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id, platform, author_id)
     DO UPDATE SET author_name = EXCLUDED.author_name, reason = EXCLUDED.reason, blocked_at = now()`,
    [clientId, platform, authorId, authorName || null, reason || null]
  );
}

async function unblock(clientId, platform, authorId) {
  const { rowCount } = await db.query(
    'DELETE FROM blocklist WHERE client_id = $1 AND platform = $2 AND author_id = $3',
    [clientId, platform, authorId]
  );
  return rowCount > 0;
}

async function list(clientId) {
  const { rows } = await db.query(
    'SELECT * FROM blocklist WHERE client_id = $1 ORDER BY blocked_at DESC',
    [clientId]
  );
  return rows.map(toBlocked);
}

module.exports = { isBlocked, block, unblock, list };
