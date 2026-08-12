const express = require('express');
const { verifySignature } = require('../middleware/verifySignature');
const { shouldDelete } = require('../services/moderation');
const { getCommentText, deleteComment } = require('../services/facebook');
const eventLog = require('../services/eventLog');
const blocklist = require('../services/blocklist');
const clients = require('../services/clients');

const router = express.Router();

// Meta retries webhook deliveries; a bounded recent-IDs cache keeps a
// retried delivery (or an "edited" event for the same comment) from
// being run through moderation twice. Shared across clients since
// comment IDs are already globally unique per platform.
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
  processEntries(req.body?.entry || [], req.body?.object).catch((err) =>
    console.error('Error processing webhook payload:', err)
  );
});

// Pulls {commentId, authorId, ...} out of a change, for either a
// Facebook Page comment (field "feed") or an Instagram comment (field
// "comments"). Returns null if this change isn't a new comment we
// should act on.
function extractComment(change) {
  const value = change.value || {};

  if (change.field === 'feed') {
    if (value.item !== 'comment' || value.verb !== 'add') return null;
    return {
      commentId: value.comment_id,
      authorId: value.from?.id,
      authorName: value.from?.name,
      inlineText: value.message,
      platform: 'facebook',
    };
  }

  if (change.field === 'comments') {
    // Instagram's "comments" field has no verb on plain new-comment
    // events; only skip if one is present and explicitly not "add".
    if (value.verb && value.verb !== 'add') return null;
    return {
      commentId: value.id,
      authorId: value.from?.id,
      authorName: value.from?.username,
      inlineText: value.text,
      platform: 'instagram',
    };
  }

  return null;
}

async function processEntries(entries, object) {
  for (const entry of entries) {
    // entry.id is the Facebook Page ID for "page" object payloads, or
    // the Instagram Business Account ID for "instagram" object payloads
    // -- that's how a shared app-level webhook endpoint knows which
    // onboarded client this event belongs to.
    const client = object === 'instagram' ? await clients.getByIgUserId(entry.id) : await clients.getByPageId(entry.id);
    if (!client || !client.active) continue;

    for (const change of entry.changes || []) {
      const comment = extractComment(change);
      if (!comment) continue;

      const { commentId, authorId, authorName, inlineText, platform } = comment;
      if (!commentId) continue;

      // Skip the Page/IG account's own comments/replies so the bot
      // never evaluates or deletes its own activity.
      if (authorId && (authorId === client.pageId || authorId === client.igUserId)) {
        continue;
      }

      if (alreadyProcessed(commentId)) continue;

      const token = platform === 'instagram' ? client.igAccessToken : client.pageAccessToken;

      // Neither platform's webhook payload reliably includes the comment
      // text inline on current Graph API versions, so fetch it if missing.
      const text = typeof inlineText === 'string' ? inlineText : await getCommentText(commentId, platform, token);
      if (typeof text !== 'string') continue;

      // A previously-deleted author's comments get removed on sight,
      // skipping the OpenAI call entirely -- both faster and cheaper
      // than re-evaluating someone who's already shown they post junk.
      const isRepeatOffender = await blocklist.isBlocked(client.id, platform, authorId);

      try {
        const verdict = isRepeatOffender ? 'DELETE' : (await shouldDelete(text)) ? 'DELETE' : 'KEEP';
        const deleteResult = verdict === 'DELETE' ? await deleteComment(commentId, platform, token) : { ok: false };
        console.log(`[${client.id}] Comment ${commentId}: ${verdict}${isRepeatOffender ? ' (blocklisted author, skipped AI check)' : ''}`);
        await eventLog.record(client.id, {
          commentId, text, verdict, deleted: deleteResult.ok, platform,
          author: authorName, authorId, autoBlocked: isRepeatOffender,
        });

        if (verdict === 'DELETE' && !isRepeatOffender) {
          await blocklist.block(client.id, platform, authorId, authorName, commentId);
        }
      } catch (err) {
        console.error(`[${client.id}] Error moderating comment ${commentId}:`, err.message);
        await eventLog.record(client.id, { commentId, text, verdict: null, deleted: false, error: err.message, platform, author: authorName, authorId });
      }
    }
  }
}

module.exports = router;
