const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'events.jsonl');
// Shared across every client now, so this needs enough headroom that
// one busy client doesn't push another's recent history out of memory.
const MAX_IN_MEMORY = 5000;

let events = [];

function loadFromDisk() {
  if (!fs.existsSync(LOG_FILE)) return;
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  events = lines
    .slice(-MAX_IN_MEMORY)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
loadFromDisk();

/**
 * Records one moderation decision for a given client. Fire-and-forget
 * disk append so a slow/full disk never blocks webhook processing;
 * in-memory copy is what the dashboard actually reads from.
 */
function record(clientId, event) {
  const entry = { clientId, timestamp: new Date().toISOString(), ...event };

  events.push(entry);
  if (events.length > MAX_IN_MEMORY) events.shift();

  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  });
}

function list(clientId, limit = 100) {
  return events
    .filter((e) => e.clientId === clientId)
    .slice(-limit)
    .reverse();
}

function getByCommentId(clientId, commentId) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].clientId === clientId && events[i].commentId === commentId) return events[i];
  }
  return null;
}

/**
 * Marks a comment as deleted after a manual action from the dashboard
 * (used when the moderation model missed something). Mutates the most
 * recent matching in-memory record and rewrites the on-disk log from
 * the full in-memory array -- the log is append-only for normal webhook
 * events, but a manual correction is rare enough that a full rewrite
 * here is simpler and safer than trying to patch one line in place.
 */
function markDeleted(clientId, commentId) {
  const entry = getByCommentId(clientId, commentId);
  if (!entry) return null;

  entry.deleted = true;
  entry.verdict = 'DELETE';
  entry.manual = true;
  delete entry.error;

  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFile(LOG_FILE, body, () => {});
  });

  return entry;
}

function stats(clientId) {
  const scoped = events.filter((e) => e.clientId === clientId);
  const total = scoped.length;
  const deleted = scoped.filter((e) => e.deleted).length;
  const kept = scoped.filter((e) => e.verdict === 'KEEP').length;
  const errors = scoped.filter((e) => e.error).length;
  const facebook = scoped.filter((e) => e.platform === 'facebook').length;
  const instagram = scoped.filter((e) => e.platform === 'instagram').length;
  return { total, deleted, kept, errors, facebook, instagram };
}

module.exports = { record, list, stats, getByCommentId, markDeleted };
