const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'blocklist.json');

// Keyed by "clientId:platform:authorId" -- author IDs are only unique
// within a platform, and now within a client too (two different clients
// could each have their own troll with the same Instagram ID coincidence
// is astronomically unlikely, but scoping by client keeps one client's
// block list fully isolated from another's regardless).
let blocked = new Map();

function key(clientId, platform, authorId) {
  return `${clientId}:${platform}:${authorId}`;
}

function loadFromDisk() {
  if (!fs.existsSync(FILE)) return;
  try {
    const entries = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    blocked = new Map(entries.map((e) => [key(e.clientId, e.platform, e.authorId), e]));
  } catch {
    blocked = new Map();
  }
}
loadFromDisk();

function persist() {
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(FILE, JSON.stringify([...blocked.values()], null, 2), () => {});
  });
}

function isBlocked(clientId, platform, authorId) {
  if (!authorId) return false;
  return blocked.has(key(clientId, platform, authorId));
}

/**
 * Blocks an author after a comment of theirs was deleted (automatically
 * or manually). Future comments from them skip moderation entirely and
 * are deleted on sight. Re-blocking just refreshes the reason/comment
 * reference rather than erroring.
 */
function block(clientId, platform, authorId, authorName, reason) {
  if (!authorId) return;
  blocked.set(key(clientId, platform, authorId), {
    clientId,
    platform,
    authorId,
    authorName: authorName || null,
    reason: reason || null,
    blockedAt: new Date().toISOString(),
  });
  persist();
}

function unblock(clientId, platform, authorId) {
  const existed = blocked.delete(key(clientId, platform, authorId));
  if (existed) persist();
  return existed;
}

function list(clientId) {
  return [...blocked.values()]
    .filter((b) => b.clientId === clientId)
    .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
}

module.exports = { isBlocked, block, unblock, list };
