const { Pool } = require('pg');

// Neon (and most managed Postgres) require SSL; rejectUnauthorized:false
// matches Neon's docs since their cert chain isn't always in Node's
// default trust store on every host. DATABASE_URL comes from Neon's
// dashboard ("Connection string").
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

function query(text, params) {
  return pool.query(text, params);
}

/**
 * Creates the schema if it doesn't exist yet. Idempotent, run once at
 * startup -- no separate migration tool for a schema this small.
 */
async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      page_id TEXT UNIQUE NOT NULL,
      page_access_token TEXT NOT NULL,
      ig_user_id TEXT UNIQUE,
      ig_access_token TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      comment_id TEXT NOT NULL,
      text TEXT,
      verdict TEXT,
      deleted BOOLEAN NOT NULL DEFAULT false,
      error TEXT,
      platform TEXT,
      author TEXT,
      author_id TEXT,
      auto_blocked BOOLEAN NOT NULL DEFAULT false,
      manual BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_events_client_time ON events(client_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_events_client_comment ON events(client_id, comment_id)');

  await query(`
    CREATE TABLE IF NOT EXISTS blocklist (
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT,
      reason TEXT,
      blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, platform, author_id)
    )
  `);
}

module.exports = { query, migrate };
