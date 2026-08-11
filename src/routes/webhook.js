const express = require('express');
const { verifySignature } = require('../middleware/verifySignature');
const { shouldDelete } = require('../services/moderation');
const { deleteComment } = require('../services/facebook');

const router = express.Router();

// Meta retries webhook deliveries; a bounded recent-IDs cache keeps a
// retried delivery (or an "edited" event for the same comment) from
// being run through moderation twice.
const MAX_SEEN = 5000;
const seenCommentIds = new Set();
function alreadyProcessed(id) {
  if (seenCommentIds.has(id)) return true;
  seenCommentIds.add(id);
  if (seenCommentIds.size > MAX_SEEN) {
    seenCommentIds.delete(seenCommentIds.values().next().value);
  }
  return false;
}

router.get('/', (req, res) => {
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

router.post('/', verifySignature, (req, res) => {
  // Ack immediately: Meta expects a fast 200 and will retry (and may
  // eventually unsubscribe the endpoint) if processing is slow.
  res.sendStatus(200);
  processEntries(req.body?.entry || []).catch((err) =>
    console.error('Error processing webhook payload:', err)
  );
});

async function processEntries(entries) {
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field !== 'feed') continue;

      const value = change.value || {};
      if (value.item !== 'comment' || value.verb !== 'add') continue;

      // Skip the Page's own comments/replies so the bot never
      // evaluates or deletes its own activity.
      if (value.sender_id && value.sender_id === process.env.PAGE_ID) continue;

      const commentId = value.comment_id;
      const text = value.message;
      if (!commentId || typeof text !== 'string') continue;
      if (alreadyProcessed(commentId)) continue;

      try {
        if (await shouldDelete(text)) {
          await deleteComment(commentId);
        }
      } catch (err) {
        console.error(`Error moderating comment ${commentId}:`, err.message);
      }
    }
  }
}

module.exports = router;
