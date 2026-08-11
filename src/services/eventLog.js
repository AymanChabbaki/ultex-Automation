const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'events.jsonl');
const MAX_IN_MEMORY = 1000;

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
 * Records one moderation decision. Fire-and-forget disk append so a
 * slow/full disk never blocks webhook processing; in-memory copy is
 * what the dashboard actually reads from.
 */
function record(event) {
  const entry = { timestamp: new Date().toISOString(), ...event };

  events.push(entry);
  if (events.length > MAX_IN_MEMORY) events.shift();

  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  });
}

function list(limit = 100) {
  return events.slice(-limit).reverse();
}

function stats() {
  const total = events.length;
  const deleted = events.filter((e) => e.deleted).length;
  const kept = events.filter((e) => e.verdict === 'KEEP').length;
  const errors = events.filter((e) => e.error).length;
  return { total, deleted, kept, errors };
}

module.exports = { record, list, stats };
