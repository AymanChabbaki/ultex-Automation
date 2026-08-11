const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'blocklist.json');

// Keyed by "platform:authorId" -- author IDs are platform-specific
// namespaces (a Facebook user ID and an Instagram user ID are unrelated
// even for the same person), so blocking is scoped per platform.
let blocked = new Map();

function key(platform, authorId) {
  return `${platform}:${authorId}`;
}

function loadFromDisk() {
  if (!fs.existsSync(FILE)) return;
  try {
    const entries = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    blocked = new Map(entries.map((e) => [key(e.platform, e.authorId), e]));
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

function isBlocked(platform, authorId) {
  if (!authorId) return false;
  return blocked.has(key(platform, authorId));
}

/**
 * Blocks an author after a comment of theirs was deleted (automatically
 * or manually). Future comments from them skip moderation entirely and
 * are deleted on sight. Re-blocking just refreshes the reason/comment
 * reference rather than erroring.
 */
function block(platform, authorId, authorName, reason) {
  if (!authorId) return;
  blocked.set(key(platform, authorId), {
    platform,
    authorId,
    authorName: authorName || null,
    reason: reason || null,
    blockedAt: new Date().toISOString(),
  });
  persist();
}

function unblock(platform, authorId) {
  const existed = blocked.delete(key(platform, authorId));
  if (existed) persist();
  return existed;
}

function list() {
  return [...blocked.values()].sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
}

module.exports = { isBlocked, block, unblock, list };
