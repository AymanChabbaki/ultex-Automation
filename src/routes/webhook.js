const express = require('express');
const { verifySignature } = require('../middleware/verifySignature');
const { shouldDelete } = require('../services/moderation');
const { getCommentText, deleteComment } = require('../services/facebook');
const eventLog = require('../services/eventLog');

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
  // Set DEBUG_WEBHOOK_PAYLOAD=true in .env to see the exact JSON Meta
  // sends -- useful whenever a new field/platform's payload shape needs
  // confirming, without having to add/remove logging code each time.
  if (process.env.DEBUG_WEBHOOK_PAYLOAD === 'true') {
    console.log('Webhook payload:', JSON.stringify(req.body));
  }
  processEntries(req.body?.entry || []).catch((err) =>
    console.error('Error processing webhook payload:', err)
  );
});

// Pulls {commentId, authorId} out of a change, for either a Facebook Page
// comment (field "feed") or an Instagram comment (field "comments").
// Returns null if this change isn't a new comment we should act on.
function extractComment(change) {
  const value = change.value || {};

  if (change.field === 'feed') {
    if (value.item !== 'comment' || value.verb !== 'add') return null;
    return { commentId: value.comment_id, authorId: value.from?.id, inlineText: value.message };
  }

  if (change.field === 'comments') {
    // Instagram's "comments" field has no verb on plain new-comment
    // events; only skip if one is present and explicitly not "add".
    if (value.verb && value.verb !== 'add') return null;
    return { commentId: value.id, authorId: value.from?.id, inlineText: value.text };
  }

  return null;
}

async function processEntries(entries) {
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const comment = extractComment(change);
      if (!comment) continue;

      const { commentId, authorId, inlineText } = comment;
      if (!commentId) continue;

      // Skip the Page/IG account's own comments/replies so the bot
      // never evaluates or deletes its own activity.
      if (authorId && (authorId === process.env.PAGE_ID || authorId === process.env.IG_USER_ID)) {
        continue;
      }

      if (alreadyProcessed(commentId)) continue;

      // Neither platform's webhook payload reliably includes the comment
      // text inline on current Graph API versions, so fetch it if missing.
      const text = typeof inlineText === 'string' ? inlineText : await getCommentText(commentId);
      if (typeof text !== 'string') continue;

      try {
        const verdict = (await shouldDelete(text)) ? 'DELETE' : 'KEEP';
        const deleted = verdict === 'DELETE' ? await deleteComment(commentId) : false;
        console.log(`Comment ${commentId}: ${verdict}`);
        eventLog.record({ commentId, text, verdict, deleted });
      } catch (err) {
        console.error(`Error moderating comment ${commentId}:`, err.message);
        eventLog.record({ commentId, text, verdict: null, deleted: false, error: err.message });
      }
    }
  }
}

module.exports = router;
